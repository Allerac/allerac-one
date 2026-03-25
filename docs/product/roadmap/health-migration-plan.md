# Health Migration Plan: allerac-health → allerac-one

**Status:** In progress
**Started:** 2026-03-18
**Goal:** Absorb all allerac-health functionality into allerac-one, eliminating the separate service.

---

## Context

### What allerac-one already has (pre-migration)

- `src/app/components/settings/GarminSettings.tsx` — full Garmin UI (login, MFA, sync, disconnect, open health app)
- `src/app/actions/health.ts` — server actions that proxy calls to the allerac-health backend via JWT
- `src/app/tools/health.tool.ts` — AI tool for querying health data
- `src/database/seed-data/005_seed_health_skill.sql` — AI skill for health coaching

### What allerac-health has (to be migrated)

- FastAPI backend (Python) — Garmin auth endpoints and data query endpoints
- Celery worker (Python) — scheduled Garmin sync via `garminconnect` library
- PostgreSQL: `garmin_credentials`, `sync_jobs`, `mfa_sessions`, `user_settings`
- **InfluxDB**: all health metrics (`daily_stats`, `sleep`, `heart_rate`, `body_battery`, `stress`, `hrv`)
- Redis: Celery task queue

---

## Architecture Decision: InfluxDB → PostgreSQL

**Decision: Migrate time-series health data into allerac-one's existing PostgreSQL.**

**Rationale:**
- Garmin data is **daily granularity** (one record per day per metric), not high-frequency. InfluxDB is overkill.
- Eliminates InfluxDB + Redis + Celery from the stack entirely.
- Single database simplifies backup, restore, and maintenance.
- Temporal queries (`WHERE date BETWEEN x AND y AND user_id = ?`) are trivial in PostgreSQL with a proper index.

## Architecture Decision: Garmin Sync Worker

**Decision: Keep a minimal Python microservice for Garmin sync (short-term), evaluate npm `garmin-connect` later.**

**Rationale:**
- The Python `garminconnect` library is mature and actively maintained.
- The npm `garmin-connect` package exists but is less battle-tested for auth edge cases (MFA, token refresh).
- Garmin's unofficial API changes frequently — stability matters here.
- The worker will be simplified: no Celery, no Redis, just a small HTTP server that the Next.js app calls.

---

## Target Architecture (post-migration)

```
allerac-one (Next.js)     — main app, includes health dashboard at /health
postgres                  — single database, includes health metrics tables
health-worker             — minimal Python HTTP server (garminconnect only)
ollama                    — unchanged
```

Redis and InfluxDB are fully eliminated.

---

## Migration Phases

### Phase 1 — Database Migrations ✅ TODO

Add new tables to allerac-one's PostgreSQL via numbered migration files in `src/database/migrations/`.

**New tables:**

```sql
-- Garmin credentials (replaces allerac-health's garmin_credentials)
garmin_credentials
  id UUID PK
  user_id UUID FK → users(id) UNIQUE
  email_encrypted TEXT
  password_encrypted TEXT (nullable)
  oauth1_token_encrypted TEXT (nullable)  — garminconnect session dump
  oauth2_token_encrypted TEXT (nullable)
  is_connected BOOLEAN DEFAULT false
  mfa_pending BOOLEAN DEFAULT false
  last_sync_at TIMESTAMP
  last_error TEXT
  sync_enabled BOOLEAN DEFAULT true
  created_at TIMESTAMP
  updated_at TIMESTAMP

-- Daily health metrics (replaces InfluxDB)
health_daily_metrics
  id UUID PK
  user_id UUID FK → users(id)
  date DATE NOT NULL
  -- Activity
  steps INTEGER
  calories INTEGER
  distance_meters INTEGER
  active_minutes INTEGER
  floors_climbed INTEGER
  -- Heart rate
  resting_hr INTEGER
  avg_hr INTEGER
  max_hr INTEGER
  -- Sleep
  sleep_duration_minutes INTEGER
  sleep_deep_minutes INTEGER
  sleep_light_minutes INTEGER
  sleep_rem_minutes INTEGER
  sleep_awake_minutes INTEGER
  sleep_score INTEGER
  -- Body battery
  body_battery_min INTEGER
  body_battery_max INTEGER
  body_battery_end INTEGER
  body_battery_charged INTEGER
  body_battery_drained INTEGER
  -- Stress
  stress_avg INTEGER
  stress_max INTEGER
  stress_rest_duration_minutes INTEGER
  -- HRV
  hrv_weekly_avg INTEGER
  hrv_last_night INTEGER
  hrv_status VARCHAR(50)
  created_at TIMESTAMP
  updated_at TIMESTAMP
  UNIQUE(user_id, date)

-- Sync jobs (replaces allerac-health's sync_jobs)
health_sync_jobs
  id UUID PK
  user_id UUID FK → users(id)
  status VARCHAR(20)  — pending|running|completed|failed|mfa_required
  job_type VARCHAR(20)  — full|incremental|manual
  started_at TIMESTAMP
  completed_at TIMESTAMP
  records_fetched INTEGER
  error_message TEXT
  metadata JSONB
  created_at TIMESTAMP

-- MFA sessions (replaces allerac-health's mfa_sessions)
health_mfa_sessions
  id UUID PK
  user_id UUID FK → users(id) UNIQUE
  garmin_email VARCHAR(255)
  session_data_encrypted TEXT
  expires_at TIMESTAMP  — 10 min TTL
  created_at TIMESTAMP
```

**Indexes:**
```sql
CREATE INDEX ON health_daily_metrics (user_id, date DESC);
CREATE INDEX ON health_sync_jobs (user_id, created_at DESC);
CREATE INDEX ON health_mfa_sessions (expires_at);  -- for TTL cleanup
```

**Migration files created:**
- `src/database/migrations/015_garmin_credentials.sql`
- `src/database/migrations/016_health_daily_metrics.sql`
- `src/database/migrations/017_health_sync_jobs.sql`
- `src/database/migrations/018_health_mfa_sessions.sql`

---

### Phase 2 — Minimal Python Worker ✅ TODO

Create a minimal Python HTTP service inside the allerac-one monorepo.

**Location:** `services/health-worker/`

**Structure:**
```
services/health-worker/
  app.py          — FastAPI/Flask minimal HTTP server
  garmin.py       — garminconnect wrapper (auth + data fetch)
  requirements.txt
  Dockerfile
```

**Endpoints exposed (called by Next.js):**
```
POST /connect        — { email, password } → { status, session_id? }
POST /mfa            — { session_id, code } → { status, oauth_tokens }
DELETE /disconnect   — { user_id } → 204
POST /sync           — { user_id, oauth_tokens, start_date, end_date } → { metrics[] }
GET  /health         — liveness check
```

**Key difference from current allerac-health worker:**
- No Celery, no Redis — sync is triggered on-demand by Next.js
- Returns data as JSON to Next.js (which writes to PostgreSQL)
- The MFA flow uses in-memory state with a short TTL (same pattern, simplified)
- Scheduled sync is handled by a Next.js cron route (`/api/cron/health-sync`)

---

### Phase 3 — Server Actions Refactor ✅ TODO

Migrate `src/app/actions/health.ts` from "proxy to allerac-health" to "direct PostgreSQL + worker calls".

**Changes:**
- `connectGarmin(userId, email, password)` → calls `health-worker /connect`, stores session in `health_mfa_sessions`
- `submitGarminMfa(userId, code)` → calls `health-worker /mfa`, stores tokens in `garmin_credentials`
- `disconnectGarmin(userId)` → deletes from `garmin_credentials`
- `triggerHealthSync(userId)` → calls `health-worker /sync`, writes results to `health_daily_metrics`
- `getGarminStatus(userId)` → query `garmin_credentials` directly
- Add: `getHealthMetrics(userId, startDate, endDate)` → query `health_daily_metrics`
- Add: `getHealthSummary(userId, period)` → aggregation query on `health_daily_metrics`
- Remove: JWT generation, SSO token logic, `HEALTH_API_URL` dependency

Also update `src/app/tools/health.tool.ts` to use the new actions instead of calling the health backend directly.

---

### Phase 4 — Health Dashboard ✅ TODO

New route `/health` in Next.js with a dedicated health dashboard.

**Location:** `src/app/[locale]/health/page.tsx`

**Components to create in `src/app/components/health/`:**
- `HealthDashboard.tsx` — main layout
- `HealthSummaryCards.tsx` — steps, sleep, heart rate, body battery for today/yesterday
- `ActivityChart.tsx` — steps/calories trend (last 7 or 30 days)
- `SleepChart.tsx` — sleep breakdown trend
- `HeartRateChart.tsx` — resting HR trend
- `BodyBatteryChart.tsx` — body battery timeline
- `GarminSyncStatus.tsx` — last sync time + manual sync button

**UI patterns:** Use existing Tailwind patterns from the app. Mobile-first. Dark mode compatible.

**Navigation:** Add "Health" link to sidebar/nav (next to existing Chat, Documents, etc.)

---

### Phase 6 — Cleanup ✅ Done

- Removed `HEALTH_API_SECRET_KEY` and `OIDC_CLIENT_SECRET_HEALTH` from `.env`
- Removed `allerac-health` OIDC client from `src/app/services/oidc/provider.ts`
- `GarminSettings.tsx` had no SSO button to remove (already clean)
- `docker-compose.local.yml` had no old allerac-health service references
- allerac-health was never in production — no data migration needed (Phase 5 skipped)
- Archive the `allerac-health` repo when ready

---

## Progress Tracker

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 — DB Migrations | ✅ Done | migrations 015–018 |
| Phase 2 — Python Worker | ✅ Done | `services/health-worker/` FastAPI at port 8001 |
| Phase 3 — Server Actions | ✅ Done | actions/health.ts + health.tool.ts + GarminSettings.tsx |
| Phase 4 — Health Dashboard | ✅ Done | components/health/HealthDashboard.tsx — sidebar button + i18n (en/pt/es) |
| Phase 6 — Cleanup | ✅ Done | OIDC client removed, old env vars removed |

## Post-Phase-4 Fixes & Improvements (2026-03-20)

- **Float → Integer cast**: Garmin API returns some fields (e.g. `distance_meters`, `floors_climbed`) as floats. Added `toInt()` helper in `_upsertMetrics` to `Math.round()` all numeric fields before PostgreSQL insert.
- **Date serialization**: `getHealthMetrics` now normalizes PostgreSQL `DATE` objects to ISO strings to avoid `Invalid Date` in the UI.
- **Period filters**: Replaced `week/month` with `today / 3 days / 7 days / 30 days`. Default is 7 days.
- **Period-aware sync**: `triggerHealthSync` now accepts a `days` parameter. The dashboard passes the current period's days so "Sync" always fetches the visible range.
- **Sleep detail section**: Dashboard shows Deep / Light / REM / Awake phases (actual values for Today, averages for multi-day). Sleep score shown as a badge.
- **Today mode**: Cards show actual values for the day instead of averages. Sleep card shows duration + score.
- **Spark charts**: Bar chart for ≤5 data points, SVG line chart with area fill for 7/30 days. Charts hidden on mobile (`hidden sm:block`) for a cleaner layout.
- **`update.sh` URL fix**: APP_PORT fallback now uses `${APP_PORT:-8080}` to handle empty variable correctly.
- **`HEALTH_WORKER_SECRET`**: Must be set in `.env` (both local and VM). Worker also needs restart after `.env` change.

---

## Environment Variables

### Removed
```
HEALTH_API_URL
HEALTH_APP_URL
HEALTH_API_SECRET_KEY
OIDC_CLIENT_SECRET_HEALTH
```

### To add
```
HEALTH_WORKER_URL=http://health-worker:8001   # Internal URL for the minimal Python worker
HEALTH_WORKER_SECRET=<shared-secret>          # For authenticating requests to the worker
```

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Garmin unofficial API changes | Use Python `garminconnect` lib (actively maintained, community watches for changes) |
| Historical data loss from InfluxDB | Run Phase 5 migration script before Phase 6 shutdown |
| MFA stateful flow complexity | Keep same threading pattern in the simplified worker |
| PostgreSQL performance for time-series | `(user_id, date DESC)` composite index is sufficient for daily granularity |

---

## Related Files

**allerac-one (current):**
- `src/app/components/settings/GarminSettings.tsx`
- `src/app/actions/health.ts`
- `src/app/tools/health.tool.ts`
- `src/database/seed-data/005_seed_health_skill.sql`

**allerac-health (source):**
- `backend/app/api/v1/garmin.py`
- `backend/app/services/garmin.py`
- `worker/app/tasks/garmin_fetch.py`
- `scripts/init-db.sql`
