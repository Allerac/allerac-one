"""
Garmin Connect integration.

Auth flow (with CF Worker):
  1. authenticate(email, password)
     → calls Worker /login-start
     → returns { status: "success", session_dump } or { status: "mfa_required", session_id }
  2. complete_mfa(session_id, mfa_code)
     → calls Worker /login-complete
     → returns { status: "success", session_dump }

Auth flow (fallback — no CF Worker configured):
  Uses garth directly. Works on IPs not blocked by Garmin.

Data fetch:
  fetch_metrics(session_dump, start_date, end_date)
  → returns a list of daily metric dicts for health_daily_metrics table.
"""

import json
import logging
import os
import time
import uuid
from datetime import datetime, date, timedelta
from typing import Any

import requests as _requests

logger = logging.getLogger(__name__)

_AUTH_WORKER_URL = os.getenv("AUTH_WORKER_URL", "").rstrip("/")
_AUTH_WORKER_SECRET = os.getenv("AUTH_WORKER_SECRET", "")

# In-memory store for pending MFA states: session_id → { state, created_at }
_pending: dict[str, dict] = {}


def _cleanup_expired():
    cutoff = datetime.utcnow() - timedelta(minutes=10)
    expired = [sid for sid, s in _pending.items() if s["created_at"] < cutoff]
    for sid in expired:
        logger.info(f"Removing expired MFA session {sid}")
        del _pending[sid]


def _worker_post(path: str, payload: dict) -> dict:
    resp = _requests.post(
        f"{_AUTH_WORKER_URL}{path}",
        json=payload,
        headers={"X-Worker-Secret": _AUTH_WORKER_SECRET},
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"Worker error ({path}): {data['error']}")
    return data


def _build_session_dump(oauth1: dict, oauth2: dict) -> str:
    """Reconstructs a garth session dump from raw token dicts returned by the Worker."""
    from garminconnect import Garmin
    from garth.auth_tokens import OAuth1Token, OAuth2Token

    allowed_oauth1 = {"oauth_token", "oauth_token_secret", "mfa_token", "mfa_expiration_timestamp"}
    garmin = Garmin()
    garmin.garth.oauth1_token = OAuth1Token(
        domain="garmin.com",
        **{k: v for k, v in oauth1.items() if k in allowed_oauth1 and v}
    )

    # Ensure expiration fields are present
    now = int(time.time())
    if "expires_at" not in oauth2:
        oauth2["expires_at"] = now + int(oauth2.get("expires_in", 3600))
    if "refresh_token_expires_at" not in oauth2:
        oauth2["refresh_token_expires_at"] = now + int(oauth2.get("refresh_token_expires_in", 7776000))

    garmin.garth.oauth2_token = OAuth2Token(**oauth2)
    return garmin.garth.dumps()


# ---------------------------------------------------------------------------
# authenticate — works with or without CF Worker
# ---------------------------------------------------------------------------

def authenticate(email: str, password: str) -> dict[str, Any]:
    """
    Initiates Garmin authentication.
    Returns { status: "success", session_dump } or { status: "mfa_required", session_id }.
    """
    _cleanup_expired()

    if _AUTH_WORKER_URL:
        return _authenticate_via_worker(email, password)
    else:
        return _authenticate_direct(email, password)


def _authenticate_via_worker(email: str, password: str) -> dict[str, Any]:
    logger.info(f"[Garmin] starting login via CF Worker for {email}")
    data = _worker_post("/login-start", {"email": email, "password": password})

    if not data.get("mfa_required"):
        tokens = data["tokens"]
        session_dump = _build_session_dump(tokens["oauth1"], tokens["oauth2"])
        logger.info(f"[Garmin] login successful (no MFA) for {email}")
        return {"status": "success", "session_dump": session_dump}

    # MFA required — store state, return session_id to caller
    session_id = str(uuid.uuid4())
    _pending[session_id] = {
        "state": data["state"],
        "created_at": datetime.utcnow(),
    }
    logger.info(f"[Garmin] MFA required for {email}, session {session_id}")
    return {"status": "mfa_required", "session_id": session_id}


def _authenticate_direct(email: str, password: str) -> dict[str, Any]:
    """Fallback: direct garth login (for local IPs not blocked by Garmin)."""
    import threading
    import queue

    from garminconnect import Garmin

    mfa_q: queue.Queue = queue.Queue()
    result_q: queue.Queue = queue.Queue()
    mfa_event = threading.Event()
    session_id = str(uuid.uuid4())

    def prompt_mfa() -> str:
        logger.info(f"MFA required for session {session_id}")
        mfa_event.set()
        return mfa_q.get(timeout=310)

    def run():
        try:
            garmin = Garmin(email=email, password=password)
            garmin.garth.login(email, password, prompt_mfa=prompt_mfa)
            session_dump = garmin.garth.dumps()
            result_q.put({"status": "success", "session_dump": session_dump})
        except Exception as e:
            logger.error(f"Garmin direct login failed: {e}", exc_info=True)
            result_q.put({"status": "error", "error": str(e)})
        finally:
            _pending.pop(session_id, None)

    _pending[session_id] = {
        "mfa_queue": mfa_q,
        "result_queue": result_q,
        "created_at": datetime.utcnow(),
    }
    threading.Thread(target=run, daemon=True).start()

    deadline = datetime.utcnow() + timedelta(seconds=60)
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

    _pending.pop(session_id, None)
    raise RuntimeError("Login timeout: Garmin did not respond in 60s")


# ---------------------------------------------------------------------------
# complete_mfa
# ---------------------------------------------------------------------------

def complete_mfa(session_id: str, mfa_code: str) -> dict[str, Any]:
    """
    Submits MFA code and returns { status: "success", session_dump }.
    """
    session = _pending.get(session_id)
    if not session:
        raise RuntimeError("MFA session not found or expired. Please try connecting again.")

    if _AUTH_WORKER_URL:
        return _complete_mfa_via_worker(session_id, session, mfa_code)
    else:
        return _complete_mfa_direct(session_id, session, mfa_code)


def _complete_mfa_via_worker(session_id: str, session: dict, mfa_code: str) -> dict[str, Any]:
    logger.info(f"[Garmin] submitting MFA via CF Worker for session {session_id}")
    data = _worker_post("/login-complete", {"state": session["state"], "mfa_code": mfa_code})
    tokens = data["tokens"]
    session_dump = _build_session_dump(tokens["oauth1"], tokens["oauth2"])
    _pending.pop(session_id, None)
    logger.info(f"[Garmin] MFA login successful for session {session_id}")
    return {"status": "success", "session_dump": session_dump}


def _complete_mfa_direct(session_id: str, session: dict, mfa_code: str) -> dict[str, Any]:
    import queue
    session["mfa_queue"].put(mfa_code)
    deadline = datetime.utcnow() + timedelta(seconds=60)
    while datetime.utcnow() < deadline:
        try:
            result = session["result_queue"].get(timeout=0.3)
            if result["status"] == "success":
                return result
            raise RuntimeError(result["error"])
        except queue.Empty:
            pass
    raise RuntimeError("MFA timeout: authentication did not complete in 60s")


# ---------------------------------------------------------------------------
# fetch_metrics — unchanged, uses session_dump from authenticate/complete_mfa
# ---------------------------------------------------------------------------

def _garmin_from_session(session_dump: str):
    from garminconnect import Garmin
    garmin = Garmin()
    garmin.garth.loads(session_dump)
    profile = garmin.garth.profile
    garmin.display_name = profile.get("displayName")
    garmin.full_name = profile.get("fullName")
    return garmin


def fetch_metrics(session_dump: str, start_date: date, end_date: date) -> list[dict]:
    """
    Fetches daily health metrics from Garmin for the given date range.
    Returns a list of dicts compatible with health_daily_metrics table columns.
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

        try:
            hr = garmin.get_heart_rates(date_str)
            if hr:
                row["resting_hr"] = hr.get("restingHeartRate")
                row["avg_hr"] = hr.get("averageHeartRate")
                row["max_hr"] = hr.get("maxHeartRate")
        except Exception as e:
            logger.warning(f"heart_rate {date_str}: {e}")

        try:
            sleep = garmin.get_sleep_data(date_str)
            if sleep and sleep.get("dailySleepDTO"):
                s = sleep["dailySleepDTO"]
                secs = lambda k: int((s.get(k) or 0) / 60)
                row["sleep_duration_minutes"] = secs("sleepTimeSeconds")
                row["sleep_deep_minutes"] = secs("deepSleepSeconds")
                row["sleep_light_minutes"] = secs("lightSleepSeconds")
                row["sleep_rem_minutes"] = secs("remSleepSeconds")
                row["sleep_awake_minutes"] = secs("awakeSleepSeconds")
                scores = s.get("sleepScores") or {}
                row["sleep_score"] = (scores.get("overall") or {}).get("value")
        except Exception as e:
            logger.warning(f"sleep {date_str}: {e}")

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

        try:
            stress = garmin.get_stress_data(date_str)
            if stress:
                row["stress_avg"] = stress.get("avgStressLevel")
                row["stress_max"] = stress.get("maxStressLevel")
                rest_secs = stress.get("restStressDuration")
                row["stress_rest_duration_minutes"] = int(rest_secs / 60) if rest_secs else None
        except Exception as e:
            logger.warning(f"stress {date_str}: {e}")

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
