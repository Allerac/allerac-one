"""
Garmin Connect integration.

Auth flow:
  1. authenticate(email, password) — starts login in a background thread.
     Returns { status: "success", session_dump } or { status: "mfa_required", session_id }.
  2. complete_mfa(session_id, mfa_code) — unblocks the waiting thread.
     Returns { status: "success", session_dump }.

Data fetch:
  fetch_metrics(session_dump, start_date, end_date) — returns a list of daily
  metric dicts ready to be inserted into health_daily_metrics.
"""

import json
import logging
import threading
import queue
import uuid
from datetime import datetime, date, timedelta
from typing import Any

logger = logging.getLogger(__name__)

# In-memory MFA sessions: session_id → { mfa_queue, result_queue, created_at }
_pending: dict[str, dict] = {}
_lock = threading.Lock()

MFA_TIMEOUT_SECS = 310   # 5 min + margin
LOGIN_TIMEOUT_SECS = 60


def _cleanup_expired():
    cutoff = datetime.utcnow() - timedelta(minutes=10)
    with _lock:
        expired = [sid for sid, s in _pending.items() if s["created_at"] < cutoff]
        for sid in expired:
            logger.info(f"Removing expired MFA session {sid}")
            del _pending[sid]


def _login_thread(
    email: str,
    password: str,
    session_id: str,
    mfa_queue: "queue.Queue[str]",
    result_queue: "queue.Queue[dict]",
    mfa_needed_event: threading.Event,
):
    from garminconnect import Garmin

    def prompt_mfa() -> str:
        logger.info(f"MFA required for session {session_id}")
        mfa_needed_event.set()
        try:
            return mfa_queue.get(timeout=MFA_TIMEOUT_SECS)
        except queue.Empty:
            raise RuntimeError("MFA timeout: code not provided in time")

    try:
        garmin = Garmin(email=email, password=password)
        garmin.garth.sess.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            "origin": "https://sso.garmin.com",
            "referer": "https://sso.garmin.com/",
        })
        garmin.garth.login(email, password, prompt_mfa=prompt_mfa)
        session_dump = garmin.garth.dumps()
        logger.info(f"Garmin login successful for {email}")
        result_queue.put({"status": "success", "session_dump": session_dump})
    except Exception as e:
        logger.error(f"Garmin login failed for {email}: {e}", exc_info=True)
        result_queue.put({"status": "error", "error": str(e)})
    finally:
        with _lock:
            _pending.pop(session_id, None)


def authenticate(email: str, password: str) -> dict[str, Any]:
    """
    Starts Garmin authentication. Blocks up to 60s waiting for MFA signal or success.
    Returns { status, session_dump? } or { status: "mfa_required", session_id }.
    """
    _cleanup_expired()

    session_id = str(uuid.uuid4())
    mfa_q: queue.Queue = queue.Queue()
    result_q: queue.Queue = queue.Queue()
    mfa_event = threading.Event()

    with _lock:
        _pending[session_id] = {
            "mfa_queue": mfa_q,
            "result_queue": result_q,
            "created_at": datetime.utcnow(),
        }

    thread = threading.Thread(
        target=_login_thread,
        args=(email, password, session_id, mfa_q, result_q, mfa_event),
        daemon=True,
    )
    thread.start()

    deadline = datetime.utcnow() + timedelta(seconds=LOGIN_TIMEOUT_SECS)
    while datetime.utcnow() < deadline:
        if mfa_event.wait(timeout=0.3):
            return {"status": "mfa_required", "session_id": session_id}
        try:
            result = result_q.get_nowait()
            if result["status"] == "success":
                return result
            raise RuntimeError(result["error"])
        except queue.Empty:
            pass

    with _lock:
        _pending.pop(session_id, None)
    raise RuntimeError("Login timeout: Garmin did not respond in 60s")


def complete_mfa(session_id: str, mfa_code: str) -> dict[str, Any]:
    """
    Submits MFA code to the waiting login thread and returns the result.
    """
    with _lock:
        session = _pending.get(session_id)

    if not session:
        raise RuntimeError("MFA session not found or expired. Please try connecting again.")

    session["mfa_queue"].put(mfa_code)

    deadline = datetime.utcnow() + timedelta(seconds=LOGIN_TIMEOUT_SECS)
    while datetime.utcnow() < deadline:
        try:
            result = session["result_queue"].get(timeout=0.3)
            if result["status"] == "success":
                return result
            raise RuntimeError(result["error"])
        except queue.Empty:
            pass

    raise RuntimeError("MFA timeout: authentication did not complete in 60s")


def _garmin_from_session(session_dump: str):
    """Restores an authenticated Garmin client from a session dump."""
    from garminconnect import Garmin
    garmin = Garmin()
    garmin.garth.loads(session_dump)
    garmin.garth.sess.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "origin": "https://sso.garmin.com",
        "referer": "https://sso.garmin.com/",
    })
    profile = garmin.garth.profile
    garmin.display_name = profile.get("displayName")
    garmin.full_name = profile.get("fullName")
    return garmin


def fetch_metrics(session_dump: str, start_date: date, end_date: date) -> list[dict]:
    """
    Fetches daily health metrics from Garmin for the given date range.
    Returns a list of dicts compatible with health_daily_metrics table columns.
    Each dict has a "date" key (ISO string) plus nullable metric fields.
    Errors on individual metrics for a day are logged but do not abort the fetch.
    """
    garmin = _garmin_from_session(session_dump)
    results = []

    current = start_date
    total = (end_date - start_date).days + 1
    day_num = 0

    while current <= end_date:
        day_num += 1
        date_str = current.isoformat()
        logger.info(f"[{day_num}/{total}] Fetching {date_str}")

        row: dict[str, Any] = {"date": date_str}

        # Activity
        try:
            stats = garmin.get_stats(date_str)
            if stats:
                row["steps"] = stats.get("totalSteps")
                row["calories"] = stats.get("totalKilocalories")
                row["distance_meters"] = stats.get("totalDistanceMeters")
                row["active_minutes"] = (
                    (stats.get("moderateIntensityMinutes") or 0)
                    + (stats.get("vigorousIntensityMinutes") or 0)
                )
                row["floors_climbed"] = stats.get("floorsAscended")
        except Exception as e:
            logger.warning(f"activity {date_str}: {e}")

        # Heart rate
        try:
            hr = garmin.get_heart_rates(date_str)
            if hr:
                row["resting_hr"] = hr.get("restingHeartRate")
                row["avg_hr"] = hr.get("averageHeartRate")
                row["max_hr"] = hr.get("maxHeartRate")
        except Exception as e:
            logger.warning(f"heart_rate {date_str}: {e}")

        # Sleep
        try:
            sleep = garmin.get_sleep_data(date_str)
            if sleep and sleep.get("dailySleepDTO"):
                s = sleep["dailySleepDTO"]
                secs = lambda k: int((s.get(k) or 0) / 60)  # seconds → minutes
                row["sleep_duration_minutes"] = secs("sleepTimeSeconds")
                row["sleep_deep_minutes"] = secs("deepSleepSeconds")
                row["sleep_light_minutes"] = secs("lightSleepSeconds")
                row["sleep_rem_minutes"] = secs("remSleepSeconds")
                row["sleep_awake_minutes"] = secs("awakeSleepSeconds")
                scores = s.get("sleepScores") or {}
                row["sleep_score"] = (scores.get("overall") or {}).get("value")
        except Exception as e:
            logger.warning(f"sleep {date_str}: {e}")

        # Body battery
        try:
            bb = garmin.get_body_battery(date_str, date_str)
            if bb and len(bb) > 0:
                day_data = bb[0] if isinstance(bb[0], dict) else None
                if day_data:
                    levels = [
                        v[1]
                        for v in (day_data.get("bodyBatteryValuesArray") or [])
                        if v and len(v) > 1 and v[1] is not None
                    ]
                    row["body_battery_max"] = max(levels) if levels else None
                    row["body_battery_min"] = min(levels) if levels else None
                    row["body_battery_end"] = levels[-1] if levels else None
                    row["body_battery_charged"] = day_data.get("charged")
                    row["body_battery_drained"] = day_data.get("drained")
        except Exception as e:
            logger.warning(f"body_battery {date_str}: {e}")

        # Stress
        try:
            stress = garmin.get_stress_data(date_str)
            if stress:
                row["stress_avg"] = stress.get("avgStressLevel")
                row["stress_max"] = stress.get("maxStressLevel")
                rest_secs = stress.get("restStressDuration")
                row["stress_rest_duration_minutes"] = int(rest_secs / 60) if rest_secs else None
        except Exception as e:
            logger.warning(f"stress {date_str}: {e}")

        # HRV
        try:
            hrv = garmin.get_hrv_data(date_str)
            if hrv:
                summary = hrv.get("hrvSummary") or {}
                row["hrv_weekly_avg"] = summary.get("weeklyAvg")
                row["hrv_last_night"] = summary.get("lastNight")
                row["hrv_status"] = summary.get("hrvStatusText")
        except Exception as e:
            logger.warning(f"hrv {date_str}: {e}")

        results.append(row)
        current += timedelta(days=1)

    logger.info(f"Fetched {len(results)} days of metrics")
    return results


def fetch_recent_activities(session_dump: str, limit: int = 10) -> list[dict]:
    """
    Fetches recent activities from Garmin.
    Returns a list of activity dicts with name, type, duration, calories, date, etc.
    """
    garmin = _garmin_from_session(session_dump)
    results = []

    try:
        # get_last_activity returns the most recent activity
        last = garmin.get_last_activity()
        if last:
            activity_id = last.get("activityId")
            if activity_id:
                # For the most recent, get full details
                activity = garmin.get_activity(str(activity_id))
                results.append(_extract_activity_summary(activity))

        # Fetch more activities if needed
        # Note: garminconnect doesn't have a direct "get_activities" method,
        # so we'd need to use the API directly or iterate via get_activity_types
        # For now, we return what we can get from get_last_activity
    except Exception as e:
        logger.warning(f"fetch_recent_activities failed: {e}")

    return results


def _extract_activity_summary(activity: dict) -> dict:
    """Extracts key fields from a Garmin activity dict."""
    return {
        "activityId": activity.get("activityId"),
        "activityName": activity.get("activityName"),
        "activityType": activity.get("activityType", {}).get("displayValue"),
        "startTimeInSeconds": activity.get("startTimeInSeconds"),
        "duration": activity.get("duration"),  # milliseconds
        "calories": activity.get("calories"),
        "distance": activity.get("distance"),
        "movingDuration": activity.get("movingDuration"),
        "avgHeartRate": activity.get("avgHeartRate"),
        "maxHeartRate": activity.get("maxHeartRate"),
        "elevationGain": activity.get("elevationGain"),
        "elevationLoss": activity.get("elevationLoss"),
    }
