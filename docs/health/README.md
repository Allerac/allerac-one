# Health Integration

Allerac integrates with Garmin Connect to sync daily health metrics (steps, sleep, heart rate, HRV, body battery, stress) and activity data into the database.

## Architecture

```
allerac-one (Next.js)
  └── actions/health.ts          server actions (auth, sync, queries)
        │
        ▼
allerac-health-worker (Python/FastAPI, port 8001)
  └── services/health-worker/
        ├── app.py               HTTP routes
        └── garmin.py            Garmin Connect logic
              │
              ├── [AUTH_WORKER_URL set]  → garmin-auth-worker (see below)
              └── [AUTH_WORKER_URL unset] → garminconnect lib → Garmin API directly
```

### garmin-auth-worker

A TypeScript service (`services/garmin-auth-worker/`) that handles the Garmin SSO login flow. It can run in two modes:

- **Cloudflare Worker** — deploy via `wrangler deploy`, runs on Cloudflare edge
- **Node.js HTTP server** — run via Docker using `src/server.ts`, for local/self-hosted setups

The worker exposes two endpoints:

| Endpoint | Description |
|---|---|
| `POST /login-start` | Runs the SSO form flow; returns tokens or MFA state |
| `POST /login-complete` | Submits MFA code; returns final tokens |

All requests require `X-Worker-Secret` header matching `WORKER_SECRET`.

---

## Auth Flow

### With garmin-auth-worker (`AUTH_WORKER_URL` set)

```
health-worker → garmin-auth-worker /login-start → sso.garmin.com (SSO)
                                                 → connectapi.garmin.com (OAuth1 preauth)
                                                 → connectapi.garmin.com (OAuth1→OAuth2 exchange)
             ← { oauth1, oauth2 tokens }
             → converts to garth session dump
             → stores encrypted in garmin_credentials.oauth1_token_encrypted
```

MFA path:

```
/login-start → { mfa_required: true, state: { cookies, csrf } }
health-worker stores state in memory (_pending dict)
user submits MFA code
/login-complete { state, mfa_code } → { tokens }
```

### Without garmin-auth-worker (direct, `AUTH_WORKER_URL` unset)

```
health-worker → garminconnect Python lib → sso.garmin.com directly
```

---

## Data Sync Flow

Once authenticated, data fetching uses the stored OAuth2 token directly — no garmin-auth-worker involved:

```
actions/health.ts
  → workerFetch POST /sync     { session_dump, start_date, end_date }
  → workerFetch POST /activities { session_dump, date }
  → workerFetch POST /daily-health { session_dump, date }

health-worker (garmin.py)
  → garminconnect lib (restores session from dump)
  → connectapi.garmin.com (Bearer token auth)
  → returns metrics / activities
```

---

## Session Format

Garmin credentials are stored encrypted in `garmin_credentials.oauth1_token_encrypted` as a **garth session dump**: a base64-encoded JSON array `[oauth1_token, oauth2_token]`.

```json
[
  { "oauth_token": "...", "oauth_token_secret": "...", "domain": "garmin.com" },
  { "scope": "...", "jti": "...", "token_type": "Bearer",
    "access_token": "...", "refresh_token": "...",
    "expires_in": 3600, "expires_at": 1234567890,
    "refresh_token_expires_in": 7776000, "refresh_token_expires_at": 1234567890 }
]
```

---

## Deployment Options

### Option A — Mini-PC / Home Server (recommended)

Run the full allerac stack on a machine with a residential IP. Garmin Connect does not block residential IPs.

```
┌─────────────────────────────────┐
│  Mini-PC (home IP)              │
│  allerac-one + health-worker    │
│  ↕ Cloudflare Tunnel            │
└─────────────────────────────────┘
```

**Config:** No `AUTH_WORKER_URL` needed. The health-worker talks to Garmin directly.

**Pros:** Simple, zero extra services, works out of the box.  
**Cons:** Requires a machine with a home/residential IP that is always on.

---

### Option B — Cloud VM + garmin-auth-worker on Mini-PC

The allerac-one instance runs on a cloud VM. A separate `garmin-auth-worker` runs on a machine with a residential IP (e.g. a home mini-PC) and is exposed via Cloudflare Tunnel.

```
┌──────────────────────┐        ┌──────────────────────────────┐
│  Cloud VM            │        │  Mini-PC (home IP)           │
│  allerac-one         │        │  garmin-auth-worker :8787    │
│  health-worker ──────┼──────► │  ↕ Cloudflare Tunnel         │
│                      │ HTTPS  │  garmin-worker.allerac.ai    │
└──────────────────────┘        └──────────────────────────────┘
                                          │
                                          ▼
                                   sso.garmin.com ✓
```

**Why cloud VMs are blocked:** Garmin's SSO (`sso.garmin.com`) blocks or rate-limits requests from known cloud provider IP ranges (AWS, Azure, GCP). Routing the login flow through a residential IP bypasses this.

**Note:** Only the *authentication* (initial login + MFA) goes through the garmin-auth-worker. Data fetching (metrics, activities) uses OAuth Bearer tokens directly from the VM to `connectapi.garmin.com`, which is generally not IP-restricted.

**Config (mini-PC `.env`):**
```env
GARMIN_WORKER_SECRET=<strong-random-secret>
```

**Config (VM `.env`):**
```env
AUTH_WORKER_URL=https://garmin-worker.allerac.ai
AUTH_WORKER_SECRET=<same value as GARMIN_WORKER_SECRET>
```

**Cloudflare Tunnel:** Add a public hostname in the dashboard:  
`garmin-worker.allerac.ai` → `http://localhost:8787`

**Start on mini-PC:**
```bash
COMPOSE_PROFILES=local docker compose up -d garmin-auth-worker
```

**Rebuild health-worker on VM:**
```bash
docker compose up -d --build health-worker
```

**Pros:** VM gets full Garmin access; mini-PC and VM can coexist independently.  
**Cons:** VM auth depends on the mini-PC being online. If mini-PC goes offline, existing sessions still work (data fetching is unaffected), but re-authentication will fail until it comes back.

---

## Tradeoff Summary

| | Option A (mini-PC only) | Option B (VM + mini-PC worker) |
|---|---|---|
| Garmin auth | ✅ Works natively | ✅ Works via proxy |
| Complexity | Low | Medium |
| VM Garmin access | ❌ | ✅ |
| Failure surface | Single machine | VM auth depends on mini-PC uptime |
| When to choose | Mini-PC is primary host | VM must be primary; mini-PC is support |

The `garmin-auth-worker` Docker service and Node.js server code are already implemented and ready to activate. To enable Option B, only environment variable configuration is required.

---

## Environment Variables

| Variable | Service | Description |
|---|---|---|
| `HEALTH_WORKER_SECRET` | `allerac-one`, `health-worker` | Shared secret for allerac-one → health-worker calls |
| `AUTH_WORKER_URL` | `health-worker` | URL of the garmin-auth-worker (Option B only) |
| `AUTH_WORKER_SECRET` | `health-worker` | Secret for health-worker → garmin-auth-worker calls |
| `GARMIN_WORKER_SECRET` | `garmin-auth-worker` | Same value as `AUTH_WORKER_SECRET`, read as `WORKER_SECRET` |
| `ENCRYPTION_KEY` | `allerac-one` | AES-256-GCM key used to encrypt stored Garmin credentials |

---

## Database Tables

| Table | Purpose |
|---|---|
| `garmin_credentials` | Encrypted OAuth tokens, connection status, last sync timestamp |
| `health_mfa_sessions` | Temporary MFA state during login (10-minute TTL) |
| `health_daily_metrics` | Daily aggregated metrics (steps, sleep, HR, HRV, etc.) |
| `health_activities` | Individual activities (runs, workouts, etc.) |
| `health_sync_jobs` | Sync job history and status |
