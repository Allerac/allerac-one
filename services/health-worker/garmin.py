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


def fetch_daily_health(session_dump: str, date: str) -> dict:
    """
    Fetches daily health metrics for a specific date (YYYY-MM-DD).
    Returns dict with steps, sleep, HR, body battery, stress, HRV data.
    """
    try:
        logger.info(f"Fetching daily health metrics for {date}")
        garmin = _garmin_from_session(session_dump)

        result = {}

        # Activity stats
        try:
            stats = garmin.get_stats(date)
            if stats:
                result["steps"] = stats.get("totalSteps")
                result["calories"] = stats.get("totalKilocalories")
                result["distance_meters"] = stats.get("totalDistanceMeters")
                result["active_minutes"] = (
                    (stats.get("moderateIntensityMinutes") or 0)
                    + (stats.get("vigorousIntensityMinutes") or 0)
                )
                result["floors_climbed"] = stats.get("floorsAscended")
                logger.info(f"  ✓ Activity stats: {result['steps']} steps, {result['calories']} cal")
        except Exception as e:
            logger.warning(f"  ✗ Activity stats error: {e}")

        # Heart rate
        try:
            hr = garmin.get_heart_rates(date)
            if hr:
                result["resting_hr"] = hr.get("restingHeartRate")
                result["avg_hr"] = hr.get("averageHeartRate")
                result["max_hr"] = hr.get("maxHeartRate")
                logger.info(f"  ✓ Heart rate: {result.get('avg_hr')} avg, {result.get('max_hr')} max")
        except Exception as e:
            logger.warning(f"  ✗ Heart rate error: {e}")

        # Sleep
        try:
            sleep = garmin.get_sleep_data(date)
            if sleep and sleep.get("dailySleepDTO"):
                s = sleep["dailySleepDTO"]
                secs = lambda k: int((s.get(k) or 0) / 60)  # seconds → minutes
                result["sleep_duration_minutes"] = secs("sleepTimeSeconds")
                result["sleep_deep_minutes"] = secs("deepSleepSeconds")
                result["sleep_light_minutes"] = secs("lightSleepSeconds")
                result["sleep_rem_minutes"] = secs("remSleepSeconds")
                result["sleep_awake_minutes"] = secs("awakeSleepSeconds")
                scores = s.get("sleepScores") or {}
                result["sleep_score"] = (scores.get("overall") or {}).get("value")
                logger.info(f"  ✓ Sleep: {result.get('sleep_duration_minutes')} min, score {result.get('sleep_score')}")
        except Exception as e:
            logger.warning(f"  ✗ Sleep error: {e}")

        # Body battery
        try:
            bb = garmin.get_body_battery(date, date)
            if bb and len(bb) > 0:
                day_data = bb[0] if isinstance(bb[0], dict) else None
                if day_data:
                    levels = [
                        v[1]
                        for v in (day_data.get("bodyBatteryValuesArray") or [])
                        if v and len(v) > 1 and v[1] is not None
                    ]
                    result["body_battery_max"] = max(levels) if levels else None
                    result["body_battery_min"] = min(levels) if levels else None
                    result["body_battery_end"] = levels[-1] if levels else None
                    result["body_battery_charged"] = day_data.get("charged")
                    result["body_battery_drained"] = day_data.get("drained")
                    logger.info(f"  ✓ Body battery: {result.get('body_battery_min')}-{result.get('body_battery_max')}")
        except Exception as e:
            logger.warning(f"  ✗ Body battery error: {e}")

        # Stress
        try:
            stress = garmin.get_stress_data(date)
            if stress:
                result["stress_avg"] = stress.get("avgStressLevel")
                result["stress_max"] = stress.get("maxStressLevel")
                rest_secs = stress.get("restStressDuration")
                result["stress_rest_duration_minutes"] = int(rest_secs / 60) if rest_secs else None
                logger.info(f"  ✓ Stress: {result.get('stress_avg')} avg")
        except Exception as e:
            logger.warning(f"  ✗ Stress error: {e}")

        # HRV
        try:
            hrv = garmin.get_hrv_data(date)
            if hrv:
                summary = hrv.get("hrvSummary") or {}
                result["hrv_weekly_avg"] = summary.get("weeklyAvg")
                result["hrv_last_night"] = summary.get("lastNight")
                result["hrv_status"] = summary.get("hrvStatusText")
                logger.info(f"  ✓ HRV: {result.get('hrv_last_night')} last night")
        except Exception as e:
            logger.warning(f"  ✗ HRV error: {e}")

        logger.info(f"Returning {len(result)} health metrics")
        return result

    except Exception as e:
        logger.error(f"fetch_daily_health FAILED: {e}", exc_info=True)
        raise


def fetch_recent_activities(session_dump: str, limit: int = 10, date: str = None) -> list[dict]:
    """
    Fetches activities from Garmin using garminconnect library.

    If date is provided (YYYY-MM-DD), fetches activities for that specific day.
    Otherwise, fetches recent activities.

    Returns a list of activity dicts with name, type, duration, calories, etc.
    """
    try:
        logger.info("1. Loading Garmin session from dump")
        garmin = _garmin_from_session(session_dump)
        logger.info(f"2. Session loaded. display_name={getattr(garmin, 'display_name', 'N/A')}")
        results = []

        if date:
            logger.info(f"3. Calling garmin.get_activities_by_date('{date}', '{date}')...")
            activities_list = garmin.get_activities_by_date(date, date)
            logger.info(f"4. ✓ get_activities_by_date() returned. Type: {type(activities_list)}, Length: {len(activities_list) if isinstance(activities_list, list) else 'N/A'}")
        else:
            logger.info(f"3. Calling garmin.get_activities(0, {limit})...")
            activities_list = garmin.get_activities(0, limit)
            logger.info(f"4. ✓ get_activities() returned. Type: {type(activities_list)}, Length: {len(activities_list) if isinstance(activities_list, list) else 'N/A'}")

        if not isinstance(activities_list, list):
            logger.warning(f"5. Expected list but got {type(activities_list)}")
            activities_list = []

        logger.info(f"6. Processing {len(activities_list)} activities")

        # Process each activity
        for idx, activity in enumerate(activities_list):
            activity_id = activity.get("activityId")
            if not activity_id:
                logger.debug(f"7.{idx} Skipping activity without ID")
                continue

            logger.info(f"7.{idx} Processing activity {activity_id}: {activity.get('activityName')}")

            try:
                activity_detail = {
                    "activityId": activity_id,
                    "activityName": activity.get("activityName", "Unknown"),
                    "activityType": (
                        activity.get("activityType", {}).get("typeKey")
                        or activity.get("activityType", {}).get("displayValue")
                        or "Unknown"
                    ),
                    "startTimeInSeconds": int(
                        datetime.fromisoformat(
                            activity.get("startTimeLocal", "").replace(".0", "")
                        ).timestamp()
                    ) if activity.get("startTimeLocal") else None,
                    "duration": activity.get("duration"),  # já em ms
                    "calories": activity.get("calories"),
                    "avgHeartRate": activity.get("averageHeartRate"),
                    "maxHeartRate": activity.get("maxHeartRate"),
                    "distance": activity.get("distance"),
                    "elevationGain": activity.get("elevationGain"),
                    "elevationLoss": activity.get("elevationLoss"),
                }

                # Strength training specific
                if activity.get("activityType", {}).get("typeKey") == "strength_training":
                    activity_detail["activeSets"] = activity.get("activeSets")
                    activity_detail["totalExerciseReps"] = activity.get("totalExerciseReps")
                    activity_detail["summarizedExerciseSets"] = activity.get("summarizedExerciseSets")

                results.append(activity_detail)
                logger.debug(f"7.{idx} ✓ Activity added to results")
            except Exception as e:
                logger.warning(f"7.{idx} Error processing activity {activity_id}: {e}", exc_info=True)
                continue

        logger.info(f"8. Returning {len(results)} activities")
        return results

    except Exception as e:
        logger.error(f"fetch_recent_activities FAILED at unknown step: {e}", exc_info=True)
        raise
