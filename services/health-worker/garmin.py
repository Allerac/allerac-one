"""
Garmin Connect integration.

Auth flow:
  1. authenticate(email, password) — starts login.
     If AUTH_WORKER_URL is set, delegates to the Cloudflare garmin-auth-worker
     (avoids cloud IP blocks on sso.garmin.com). Otherwise uses garminconnect
     directly (local dev).
     Returns { status: "success", session_dump } or { status: "mfa_required", session_id }.
  2. complete_mfa(session_id, mfa_code) — completes the MFA step.
     Returns { status: "success", session_dump }.

Data fetch:
  fetch_metrics(session_dump, start_date, end_date) — returns a list of daily
  metric dicts ready to be inserted into health_daily_metrics.
"""

import json
import logging
import math
import os
import threading
import queue
import urllib.error
import urllib.request
import uuid
from datetime import datetime, date, timedelta
from typing import Any

logger = logging.getLogger(__name__)

# Bumped whenever the field mapping below changes shape. Stored as
# health_activities.payload_version so historical rows can be reprocessed
# from provider_summary_raw/provider_details_raw without re-fetching Garmin.
MAPPER_VERSION = 1

_AUTH_WORKER_URL = os.getenv("AUTH_WORKER_URL", "").rstrip("/")
_AUTH_WORKER_SECRET = os.getenv("AUTH_WORKER_SECRET", "")

# ---------------------------------------------------------------------------
# CF Worker helpers (used when AUTH_WORKER_URL is configured)
# ---------------------------------------------------------------------------

def _use_cf_worker() -> bool:
    return bool(_AUTH_WORKER_URL and _AUTH_WORKER_SECRET)


def _cf_request(path: str, body: dict) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{_AUTH_WORKER_URL}{path}",
        data=data,
        headers={
            "Content-Type": "application/json",
            "X-Worker-Secret": _AUTH_WORKER_SECRET,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8")
        try:
            error_data = json.loads(body_text)
            raise RuntimeError(error_data.get("error", body_text))
        except json.JSONDecodeError:
            raise RuntimeError(f"CF Worker HTTP {e.code}: {body_text[:200]}")


def _tokens_to_garth_dump(tokens: dict) -> str:
    """Converts CF Worker token response to a garth session dump (base64 JSON)."""
    from garth.auth_tokens import OAuth1Token, OAuth2Token
    from garminconnect import Garmin

    oauth1 = tokens["oauth1"]
    oauth2 = tokens["oauth2"]

    client = Garmin()
    client.garth.configure(
        oauth1_token=OAuth1Token(
            oauth_token=oauth1["oauth_token"],
            oauth_token_secret=oauth1["oauth_token_secret"],
            mfa_token=oauth1.get("mfa_token"),
            domain="garmin.com",
        ),
        oauth2_token=OAuth2Token(
            scope=oauth2["scope"],
            jti=oauth2["jti"],
            token_type=oauth2["token_type"],
            access_token=oauth2["access_token"],
            refresh_token=oauth2["refresh_token"],
            expires_in=int(oauth2["expires_in"]),
            expires_at=int(oauth2["expires_at"]),
            refresh_token_expires_in=int(oauth2["refresh_token_expires_in"]),
            refresh_token_expires_at=int(oauth2["refresh_token_expires_at"]),
        ),
    )
    return client.garth.dumps()


def _authenticate_via_cf_worker(email: str, password: str) -> dict[str, Any]:
    logger.info(f"Starting Garmin auth via CF Worker for {email}")
    result = _cf_request("/login-start", {"email": email, "password": password})

    if result.get("mfa_required"):
        session_id = str(uuid.uuid4())
        with _lock:
            _pending[session_id] = {
                "cf_state": result["state"],
                "created_at": datetime.utcnow(),
            }
        logger.info(f"CF Worker MFA required, session_id={session_id}")
        return {"status": "mfa_required", "session_id": session_id}

    logger.info(f"CF Worker auth successful for {email}")
    return {"status": "success", "session_dump": _tokens_to_garth_dump(result["tokens"])}


# ---------------------------------------------------------------------------
# In-memory MFA sessions
# ---------------------------------------------------------------------------

# In-memory MFA sessions: session_id → { mfa_queue, result_queue, created_at }
#                      or session_id → { cf_state, created_at }
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
    Starts Garmin authentication.
    Returns { status, session_dump? } or { status: "mfa_required", session_id }.
    """
    _cleanup_expired()

    if _use_cf_worker():
        return _authenticate_via_cf_worker(email, password)

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
    Submits MFA code and returns { status: "success", session_dump }.
    """
    with _lock:
        session = _pending.get(session_id)

    if not session:
        raise RuntimeError("MFA session not found or expired. Please try connecting again.")

    # CF Worker MFA flow
    if "cf_state" in session:
        logger.info(f"Completing CF Worker MFA for session {session_id}")
        result = _cf_request("/login-complete", {
            "state": session["cf_state"],
            "mfa_code": mfa_code,
        })
        with _lock:
            _pending.pop(session_id, None)
        logger.info(f"CF Worker MFA completed successfully")
        return {"status": "success", "session_dump": _tokens_to_garth_dump(result["tokens"])}

    # garminconnect direct flow (local dev)
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


# ---------------------------------------------------------------------------
# Provider-neutral field mapping
#
# Garmin Connect is an unofficial/internal API (see docs/roadmap/
# health-detailed-activities.md, "Provider boundary"): field names below are
# the community-confirmed shapes for `get_activities`/`get_activities_by_date`
# list items. Stamina and sweat-loss fields are newer/less documented and are
# mapped defensively with multiple candidate keys — if none match, the
# normalized value stays None (never inferred) while the untouched Garmin
# payload is still preserved in raw_data for future reprocessing under a
# bumped MAPPER_VERSION.
# ---------------------------------------------------------------------------


def _finite_or_none(value: Any) -> float | None:
    """Distinguishes zero from missing and rejects non-finite numbers."""
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def _first_present(activity: dict, *candidates: str) -> tuple[Any, str | None]:
    """Returns (raw_value, field_name) for the first candidate key with a non-null value."""
    for key in candidates:
        raw = activity.get(key)
        if raw is not None:
            return raw, key
    return None, None


def _first_numeric(
    activity: dict, provenance: dict[str, str], provenance_key: str, *candidates: str
) -> float | None:
    raw, used_key = _first_present(activity, *candidates)
    value = _finite_or_none(raw)
    if value is not None and used_key:
        provenance[provenance_key] = used_key
    return value


def _speed_to_pace_seconds_per_km(speed_meters_per_second: float | None) -> float | None:
    if speed_meters_per_second is None or speed_meters_per_second <= 0:
        return None
    return 1000.0 / speed_meters_per_second


def normalize_activity_summary(activity: dict) -> dict[str, Any]:
    """
    Maps a raw Garmin activity (from get_activities/get_activities_by_date)
    into the provider-neutral, explicit-unit shape stored on health_activities.

    Returns { "normalized": {...}, "field_provenance": {...} }. Ambiguous
    mappings record which Garmin field was used in "field_provenance" so the
    mapping can be audited/corrected later without losing raw_data.
    """
    activity_type = activity.get("activityType") or {}
    event_type = activity.get("eventType") or {}
    provenance: dict[str, str] = {}

    avg_speed = _first_numeric(activity, provenance, "average_pace_seconds_per_km", "averageSpeed")
    max_speed = _first_numeric(activity, provenance, "best_pace_seconds_per_km", "maxSpeed")

    normalized: dict[str, Any] = {
        "provider": "garmin",
        "provider_activity_id": str(activity.get("activityId")) if activity.get("activityId") else None,
        "sport_type": activity_type.get("typeKey"),
        "sub_sport_type": event_type.get("typeKey"),
        "timezone": activity.get("timeZoneId") or activity.get("timeZoneUnitDTO", {}).get("timeZone"),
        "moving_time_seconds": _first_numeric(
            activity, provenance, "moving_time_seconds", "movingDuration"
        ),
        "elapsed_time_seconds": _first_numeric(
            activity, provenance, "elapsed_time_seconds", "elapsedDuration", "duration"
        ),
        "average_pace_seconds_per_km": _speed_to_pace_seconds_per_km(avg_speed),
        "best_pace_seconds_per_km": _speed_to_pace_seconds_per_km(max_speed),
        "average_power_watts": _first_numeric(activity, provenance, "average_power_watts", "avgPower"),
        "max_power_watts": _first_numeric(activity, provenance, "max_power_watts", "maxPower"),
        "min_elevation_meters": _first_numeric(activity, provenance, "min_elevation_meters", "minElevation"),
        "max_elevation_meters": _first_numeric(activity, provenance, "max_elevation_meters", "maxElevation"),
        "training_effect_aerobic": _first_numeric(
            activity, provenance, "training_effect_aerobic", "aerobicTrainingEffect"
        ),
        "training_effect_anaerobic": _first_numeric(
            activity, provenance, "training_effect_anaerobic", "anaerobicTrainingEffect"
        ),
        "training_benefit": activity.get("trainingEffectLabel"),
        "exercise_load": _first_numeric(
            activity, provenance, "exercise_load", "activityTrainingLoad", "trainingLoad"
        ),
        "vo2_max": _first_numeric(activity, provenance, "vo2_max", "vO2MaxValue", "vo2MaxValue"),
        "average_cadence_spm": _first_numeric(
            activity, provenance, "average_cadence_spm", "averageRunningCadenceInStepsPerMinute"
        ),
        "max_cadence_spm": _first_numeric(
            activity, provenance, "max_cadence_spm", "maxRunningCadenceInStepsPerMinute"
        ),
        "average_ground_contact_time_ms": _first_numeric(
            activity, provenance, "average_ground_contact_time_ms", "avgGroundContactTime"
        ),
        "average_vertical_ratio_percent": _first_numeric(
            activity, provenance, "average_vertical_ratio_percent", "avgVerticalRatio"
        ),
        "average_vertical_oscillation_cm": _first_numeric(
            activity, provenance, "average_vertical_oscillation_cm", "avgVerticalOscillation"
        ),
        # Garmin reports stride length in centimeters; normalize to meters.
        "average_stride_length_meters": None,
        # Best-effort/unconfirmed field names (Garmin "Real-Time Stamina" and
        # hydration features are not publicly documented). Left None unless a
        # candidate key is actually present.
        "estimated_sweat_loss_ml": _first_numeric(
            activity, provenance, "estimated_sweat_loss_ml", "sweatLoss", "estimatedSweatLoss"
        ),
        "beginning_stamina_percent": _first_numeric(
            activity, provenance, "beginning_stamina_percent", "beginningPotential"
        ),
        "ending_stamina_percent": _first_numeric(
            activity, provenance, "ending_stamina_percent", "endingPotential"
        ),
        "minimum_stamina_percent": _first_numeric(
            activity, provenance, "minimum_stamina_percent", "minAvailableStamina"
        ),
    }

    stride_cm = _first_numeric(activity, provenance, "average_stride_length_meters", "avgStrideLength")
    if stride_cm is not None:
        normalized["average_stride_length_meters"] = stride_cm / 100.0

    return {"normalized": normalized, "field_provenance": provenance}


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

                # Lossless summary: keep the full, unreduced Garmin dict plus
                # the provider-neutral normalized mapping (Phase 1 of
                # docs/roadmap/health-detailed-activities.md). `activity_detail`
                # above is kept only for backward compatibility with older
                # consumers of this function's return shape.
                mapping = normalize_activity_summary(activity)
                activity_detail["summaryRaw"] = activity
                activity_detail["normalized"] = mapping["normalized"]
                activity_detail["fieldProvenance"] = mapping["field_provenance"]
                activity_detail["payloadVersion"] = MAPPER_VERSION

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


def update_activity_exercise_sets(
    session_dump: str,
    activity_id: str,
    exercise_sets: list[dict],
) -> dict:
    """Replace the exercise sets of an existing Garmin strength activity."""
    if not activity_id or not str(activity_id).isdigit():
        raise ValueError("activity_id must be a positive numeric Garmin activity id")
    if not isinstance(exercise_sets, list) or not exercise_sets:
        raise ValueError("exercise_sets must be a non-empty list")

    garmin = _garmin_from_session(session_dump)
    activity_id = str(activity_id)
    path = f"/activity-service/activity/{activity_id}/exerciseSets"
    payload = {
        "activityId": int(activity_id),
        "exerciseSets": exercise_sets,
    }

    logger.info("Updating exercise sets for Garmin activity %s", activity_id)
    response = garmin.garth.request(
        "PUT",
        "connectapi",
        path,
        api=True,
        json=payload,
    )
    if hasattr(response, "raise_for_status"):
        response.raise_for_status()

    # Read-after-write is intentional: a 2xx alone does not guarantee that
    # Garmin accepted every exercise/category combination.
    verified = garmin.get_activity_exercise_sets(activity_id)
    verified_sets = (
        verified.get("exerciseSets", [])
        if isinstance(verified, dict)
        else []
    )

    def comparable(items: list[dict]) -> list[tuple]:
        return [
            (
                item.get("setType"),
                item.get("repetitionCount"),
                item.get("weight"),
                tuple(
                    (exercise.get("category"), exercise.get("name"))
                    for exercise in (item.get("exercises") or [])
                ),
            )
            for item in items
        ]

    if comparable(verified_sets) != comparable(exercise_sets):
        raise RuntimeError(
            "Garmin returned exercise sets different from the requested correction"
        )
    return {
        "activity_id": activity_id,
        "exercise_sets": verified,
    }


# ---------------------------------------------------------------------------
# Phase 2 — detailed activity import (laps + time-in-zone)
#
# Route/GPS samples are out of scope here (Phase 3 of docs/roadmap/
# health-detailed-activities.md). This promotes the calls that previously
# only existed in app.py's /debug-activities into a supported path.
# ---------------------------------------------------------------------------


def _map_laps(splits: dict | None) -> list[dict[str, Any]]:
    if not isinstance(splits, dict):
        return []
    lap_dtos = splits.get("lapDTOs") or []
    laps: list[dict[str, Any]] = []
    cumulative_seconds = 0.0
    for idx, lap in enumerate(lap_dtos):
        if not isinstance(lap, dict):
            continue
        duration = _finite_or_none(lap.get("duration"))
        avg_speed = _finite_or_none(lap.get("averageSpeed"))
        laps.append({
            "lap_index": idx + 1,
            "start_offset_seconds": cumulative_seconds,
            "duration_seconds": duration,
            "distance_meters": _finite_or_none(lap.get("distance")),
            "pace_seconds_per_km": _speed_to_pace_seconds_per_km(avg_speed),
            "average_heart_rate": _finite_or_none(lap.get("averageHR")),
            "average_power_watts": _finite_or_none(lap.get("averagePower")),
            "average_cadence_spm": _finite_or_none(lap.get("averageRunCadence")),
            "ascent_meters": _finite_or_none(lap.get("elevationGain")),
            "descent_meters": _finite_or_none(lap.get("elevationLoss")),
            "raw_data": lap,
        })
        if duration is not None:
            cumulative_seconds += duration
    return laps


def _map_zones(zones_response: Any, metric_type: str) -> list[dict[str, Any]]:
    if isinstance(zones_response, dict):
        entries = zones_response.get("zones") or zones_response.get("timeInZones") or []
    elif isinstance(zones_response, list):
        entries = zones_response
    else:
        entries = []

    total_seconds = sum(
        _finite_or_none(z.get("secsInZone")) or 0
        for z in entries
        if isinstance(z, dict)
    )
    mapped: list[dict[str, Any]] = []
    for z in entries:
        if not isinstance(z, dict):
            continue
        duration = _finite_or_none(z.get("secsInZone"))
        mapped.append({
            "metric_type": metric_type,
            "zone_number": z.get("zoneNumber"),
            "lower_bound": _finite_or_none(z.get("zoneLowBoundary")),
            "upper_bound": _finite_or_none(z.get("zoneHighBoundary")),
            "duration_seconds": duration,
            "percent": (
                (duration / total_seconds * 100.0)
                if duration is not None and total_seconds
                else None
            ),
            "raw_data": z,
        })
    return mapped


# ---------------------------------------------------------------------------
# Phase 3 — route and time series
#
# Douglas-Peucker simplification and polyline encoding are implemented here
# rather than adding a dependency: both are small, well-known, deterministic
# algorithms with no Garmin-specific ambiguity — unlike the best-effort
# field-name guessing in normalize_activity_summary above. Encoding follows
# Google's precision-5 encoded polyline format, decodable by any standard
# map library (Leaflet, MapLibre, Mapbox, ...), matching the roadmap's
# "renderer-neutral route contract" requirement.
# ---------------------------------------------------------------------------


def _perpendicular_distance(
    point: tuple[float, float], start: tuple[float, float], end: tuple[float, float]
) -> float:
    x, y = point
    x1, y1 = start
    x2, y2 = end
    if (x1, y1) == (x2, y2):
        return math.hypot(x - x1, y - y1)
    num = abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1)
    den = math.hypot(y2 - y1, x2 - x1)
    return num / den


def _douglas_peucker(points: list[tuple[float, float]], epsilon: float) -> list[tuple[float, float]]:
    """Reduces a polyline to within `epsilon` tolerance (same units as the
    point coordinates — degrees, for lat/lon pairs)."""
    if len(points) < 3:
        return list(points)

    start, end = points[0], points[-1]
    max_dist = -1.0
    max_index = 0
    for i in range(1, len(points) - 1):
        dist = _perpendicular_distance(points[i], start, end)
        if dist > max_dist:
            max_dist = dist
            max_index = i

    if max_dist > epsilon:
        left = _douglas_peucker(points[: max_index + 1], epsilon)
        right = _douglas_peucker(points[max_index:], epsilon)
        return left[:-1] + right
    return [start, end]


def simplify_route(
    points: list[tuple[float, float]],
    epsilon: float = 0.00005,
    max_points: int = 500,
) -> list[tuple[float, float]]:
    """
    Simplifies a route to at most `max_points` points, for list previews and
    fast initial rendering (the roadmap's "simplified route" contract).
    Increases epsilon (coarser simplification) until the output fits, rather
    than truncating — truncating would distort the shape instead of just
    reducing detail.
    """
    if len(points) <= max_points:
        return list(points)

    simplified = _douglas_peucker(points, epsilon)
    attempts = 0
    while len(simplified) > max_points and attempts < 20:
        epsilon *= 1.8
        simplified = _douglas_peucker(points, epsilon)
        attempts += 1
    return simplified


def _encode_unsigned_number(num: int) -> str:
    chunks = []
    while num >= 0x20:
        chunks.append((0x20 | (num & 0x1F)) + 63)
        num >>= 5
    chunks.append(num + 63)
    return "".join(chr(c) for c in chunks)


def _encode_signed_number(num: int) -> str:
    shifted = ~(num << 1) if num < 0 else (num << 1)
    return _encode_unsigned_number(shifted)


def encode_polyline(points: list[tuple[float, float]], precision: int = 5) -> str:
    """Encodes (lat, lon) pairs using Google's precision-5 polyline algorithm."""
    factor = 10 ** precision
    result: list[str] = []
    prev_lat = 0
    prev_lon = 0

    for lat, lon in points:
        lat_i = round(lat * factor)
        lon_i = round(lon * factor)
        result.append(_encode_signed_number(lat_i - prev_lat))
        result.append(_encode_signed_number(lon_i - prev_lon))
        prev_lat = lat_i
        prev_lon = lon_i

    return "".join(result)


def _route_bounds(geo: dict) -> dict[str, Any] | None:
    if not isinstance(geo, dict):
        return None
    bounds = {
        "min_lat": _finite_or_none(geo.get("minLat")),
        "max_lat": _finite_or_none(geo.get("maxLat")),
        "min_lon": _finite_or_none(geo.get("minLon")),
        "max_lon": _finite_or_none(geo.get("maxLon")),
    }
    if all(v is None for v in bounds.values()):
        return None
    return bounds


def _parse_activity_metrics(details: dict) -> list[dict[str, Any]]:
    """
    Maps activityDetailMetrics (indexed via metricDescriptors) into
    provider-neutral sample dicts. Field-key candidates follow the
    community-documented Garmin Connect activity-details shape; unconfirmed
    device-specific fields (stamina) are left None rather than guessed, same
    policy as normalize_activity_summary.
    """
    descriptors = details.get("metricDescriptors") or []
    key_to_index: dict[str, int] = {}
    for d in descriptors:
        if not isinstance(d, dict):
            continue
        key = d.get("key")
        index = d.get("metricsIndex")
        if key is not None and index is not None:
            key_to_index[key] = index

    def value(entry_metrics: list, *candidates: str) -> float | None:
        for key in candidates:
            index = key_to_index.get(key)
            if index is not None and 0 <= index < len(entry_metrics):
                v = _finite_or_none(entry_metrics[index])
                if v is not None:
                    return v
        return None

    entries = details.get("activityDetailMetrics") or []
    samples: list[dict[str, Any]] = []
    for i, entry in enumerate(entries):
        if not isinstance(entry, dict):
            continue
        m = entry.get("metrics") or []

        speed = value(m, "directSpeed")
        stride_cm = value(m, "directStrideLength")

        samples.append({
            "sample_index": i,
            "timestamp": value(m, "directTimestamp"),
            "elapsed_seconds": value(m, "directElapsedDuration", "sumElapsedDuration"),
            "distance_meters": value(m, "directDistance", "sumDistance"),
            "elevation_meters": value(m, "directElevation"),
            "heart_rate_bpm": value(m, "directHeartRate"),
            "speed_meters_per_second": speed,
            "pace_seconds_per_km": _speed_to_pace_seconds_per_km(speed),
            "power_watts": value(m, "directPower", "directPowerObserved"),
            "cadence_spm": value(m, "directRunCadence", "directBikeCadence"),
            "stamina_percent": value(m, "directPotential"),
            "stamina_potential_percent": value(m, "directBodyBatteryEstimated"),
            "ground_contact_time_ms": value(m, "directGroundContactTime"),
            "stride_length_meters": (stride_cm / 100.0) if stride_cm is not None else None,
            "vertical_oscillation_cm": value(m, "directVerticalOscillation"),
            "run_walk_state": None,
            "latitude": None,
            "longitude": None,
        })
    return samples


def _merge_gps_points(
    samples: list[dict[str, Any]], polyline_points: list[dict]
) -> list[dict[str, Any]]:
    """
    Fills latitude/longitude (and elevation when the metric series lacks it)
    onto `samples` using a two-pointer merge against `geoPolylineDTO.polyline`
    — both series are chronological, so this avoids an O(n*m) nearest-point
    search. If `samples` is empty (no activityDetailMetrics came back), the
    sample list is built directly from the polyline points instead.
    """
    def point_time(point: dict) -> float | None:
        raw, _ = _first_present(point, "time", "timestamp")
        return _finite_or_none(raw)

    def point_lat(point: dict) -> float | None:
        raw, _ = _first_present(point, "lat", "latitude")
        return _finite_or_none(raw)

    def point_lon(point: dict) -> float | None:
        raw, _ = _first_present(point, "lon", "longitude")
        return _finite_or_none(raw)

    def point_elevation(point: dict) -> float | None:
        raw, _ = _first_present(point, "altitude", "elevation")
        return _finite_or_none(raw)

    if not polyline_points:
        return samples

    if not samples:
        built: list[dict[str, Any]] = []
        first_time = point_time(polyline_points[0])
        for i, p in enumerate(polyline_points):
            t = point_time(p)
            built.append({
                "sample_index": i,
                "timestamp": t,
                "elapsed_seconds": (
                    (t - first_time) if (t is not None and first_time is not None) else None
                ),
                "latitude": point_lat(p),
                "longitude": point_lon(p),
                "elevation_meters": point_elevation(p),
                "distance_meters": None,
                "heart_rate_bpm": None,
                "pace_seconds_per_km": None,
                "speed_meters_per_second": None,
                "power_watts": None,
                "cadence_spm": None,
                "stamina_percent": None,
                "stamina_potential_percent": None,
                "ground_contact_time_ms": None,
                "stride_length_meters": None,
                "vertical_oscillation_cm": None,
                "run_walk_state": None,
            })
        return built

    j = 0
    for sample in samples:
        s_time = sample.get("timestamp")
        if s_time is None:
            continue
        while j + 1 < len(polyline_points):
            current_time = point_time(polyline_points[j])
            next_time = point_time(polyline_points[j + 1])
            if next_time is None:
                break
            if current_time is None or abs(next_time - s_time) <= abs(current_time - s_time):
                j += 1
            else:
                break
        gps_point = polyline_points[j]
        sample["latitude"] = point_lat(gps_point)
        sample["longitude"] = point_lon(gps_point)
        if sample.get("elevation_meters") is None:
            sample["elevation_meters"] = point_elevation(gps_point)

    return samples


def fetch_activity_details(session_dump: str, activity_id: str) -> dict[str, Any]:
    """
    Fetches laps, time-in-zone aggregates, and route/time-series samples for
    one activity.

    Each Garmin call is isolated: one failed/unsupported optional resource
    (e.g. a device that doesn't report power zones, or an indoor activity
    with no GPS route) must not abort the whole detail sync — the caller
    decides whether the overall result is 'complete' or 'partial' based on
    `errors`.

    Returns {
      "laps": [...], "zones": [...], "samples": [...],
      "route_bounds": {min_lat, max_lat, min_lon, max_lon} | None,
      "route_simplified_polyline": <encoded string> | None,
      "details_raw": { "splits": ..., "hr_zones": ..., "power_zones": ...,
                        "activity_details": ... },
      "errors": { "<resource>": "<message>" },
      "payload_version": MAPPER_VERSION,
    }
    """
    if not activity_id or not str(activity_id).isdigit():
        raise ValueError("activity_id must be a positive numeric Garmin activity id")
    activity_id = str(activity_id)

    garmin = _garmin_from_session(session_dump)
    laps: list[dict[str, Any]] = []
    zones: list[dict[str, Any]] = []
    details_raw: dict[str, Any] = {}
    errors: dict[str, str] = {}

    try:
        splits = garmin.get_activity_splits(activity_id)
        details_raw["splits"] = splits
        laps = _map_laps(splits)
    except Exception as e:
        logger.warning(f"activity {activity_id}: laps unavailable: {e}")
        errors["laps"] = str(e)

    try:
        hr_zones = garmin.get_activity_hr_in_timezones(activity_id)
        details_raw["hr_zones"] = hr_zones
        zones.extend(_map_zones(hr_zones, "heart_rate"))
    except Exception as e:
        logger.warning(f"activity {activity_id}: HR zones unavailable: {e}")
        errors["zones_heart_rate"] = str(e)

    try:
        power_zones = garmin.get_activity_power_in_timezones(activity_id)
        details_raw["power_zones"] = power_zones
        zones.extend(_map_zones(power_zones, "power"))
    except Exception as e:
        logger.warning(f"activity {activity_id}: power zones unavailable: {e}")
        errors["zones_power"] = str(e)

    samples: list[dict[str, Any]] = []
    route_bounds: dict[str, Any] | None = None
    route_simplified_polyline: str | None = None

    try:
        activity_details = garmin.get_activity_details(activity_id, maxchart=2000, maxpoly=2000)
        details_raw["activity_details"] = activity_details
        samples = _parse_activity_metrics(activity_details)
        geo = activity_details.get("geoPolylineDTO") or {}
        samples = _merge_gps_points(samples, geo.get("polyline") or [])
        route_bounds = _route_bounds(geo)

        coords = [
            (s["latitude"], s["longitude"])
            for s in samples
            if s.get("latitude") is not None and s.get("longitude") is not None
        ]
        if coords:
            route_simplified_polyline = encode_polyline(simplify_route(coords))
    except Exception as e:
        logger.warning(f"activity {activity_id}: route/samples unavailable: {e}")
        errors["route"] = str(e)

    return {
        "laps": laps,
        "zones": zones,
        "samples": samples,
        "route_bounds": route_bounds,
        "route_simplified_polyline": route_simplified_polyline,
        "details_raw": details_raw,
        "errors": errors,
        "payload_version": MAPPER_VERSION,
    }
