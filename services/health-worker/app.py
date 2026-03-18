"""
Health Worker — minimal HTTP service for Garmin Connect integration.

Called by allerac-one (Next.js) to handle Garmin auth and data fetching.
All state (credentials, metrics) is owned by allerac-one's PostgreSQL —
this service is stateless beyond in-memory MFA sessions.

Authentication: every request must include the header
  X-Worker-Secret: <HEALTH_WORKER_SECRET>
"""

import logging
import os
from datetime import date, datetime

from fastapi import FastAPI, Header, HTTPException, status
from pydantic import BaseModel

import garmin as garmin_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

WORKER_SECRET = os.getenv("HEALTH_WORKER_SECRET", "")

app = FastAPI(title="health-worker", docs_url=None, redoc_url=None)


def _auth(x_worker_secret: str = Header(...)):
    if not WORKER_SECRET:
        raise RuntimeError("HEALTH_WORKER_SECRET is not set")
    if x_worker_secret != WORKER_SECRET:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ConnectRequest(BaseModel):
    email: str
    password: str


class MfaRequest(BaseModel):
    session_id: str
    mfa_code: str


class SyncRequest(BaseModel):
    session_dump: str
    start_date: date
    end_date: date


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health_check():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


@app.post("/connect")
def connect(req: ConnectRequest, x_worker_secret: str = Header(...)):
    """
    Initiates Garmin authentication.
    Returns { status: "success", session_dump } or { status: "mfa_required", session_id }.
    """
    _auth(x_worker_secret)
    try:
        result = garmin_service.authenticate(req.email, req.password)
        return result
    except Exception as e:
        logger.error(f"connect error: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.post("/mfa")
def mfa(req: MfaRequest, x_worker_secret: str = Header(...)):
    """
    Submits MFA code to the waiting login thread.
    Returns { status: "success", session_dump }.
    """
    _auth(x_worker_secret)
    try:
        result = garmin_service.complete_mfa(req.session_id, req.mfa_code)
        return result
    except Exception as e:
        logger.error(f"mfa error: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.post("/sync")
def sync(req: SyncRequest, x_worker_secret: str = Header(...)):
    """
    Fetches daily metrics for the given date range.
    Returns { metrics: [ { date, steps, ... }, ... ] }.
    Errors on individual days are logged but do not abort the response.
    """
    _auth(x_worker_secret)
    if req.end_date < req.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date must be >= start_date",
        )
    max_days = 90
    if (req.end_date - req.start_date).days > max_days:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Date range exceeds {max_days} days. Split into smaller requests.",
        )
    try:
        metrics = garmin_service.fetch_metrics(req.session_dump, req.start_date, req.end_date)
        return {"metrics": metrics}
    except Exception as e:
        logger.error(f"sync error: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, log_level="info")
