# Proposal: Garmin Auth via Cloudflare Worker

**Status:** Proposed — implement if cloud IP rate limiting becomes a recurring issue
**Date:** 2026-03-21

---

## Problem

Garmin's SSO rate-limits login attempts from cloud provider IPs (Azure, GCP, AWS).
The 429 error occurs specifically at the OAuth token exchange step after MFA — not during sync.

Key observations:
- `/connect` (initial login) succeeds — MFA email is sent
- `/mfa` (OAuth token exchange) returns 429 — Garmin blocks the IP at this step
- Sync calls (using an existing OAuth token) are **never** blocked — only login is affected
- The same setup worked on GCP before accumulated failed attempts triggered the block
- Per-user impact: each user logs in once; daily sync reuses the saved token — low request volume per account

---

## Proposed Solution

Move **only the auth flow** (login + MFA) to a Cloudflare Worker.
Keep the sync flow on the VM health-worker (unchanged).

### Architecture

```
Current:
  Browser → allerac-one (VM) → health-worker (VM IP) → Garmin SSO ❌

Proposed:
  Browser → allerac-one (VM) → CF Worker (edge IP) → Garmin SSO ✅
  Browser → allerac-one (VM) → health-worker (VM IP) → Garmin sync ✅
```

### Why Cloudflare Worker

- Runs on 300+ edge locations with diverse, rotating IPs
- No new infrastructure — already use Cloudflare for tunnel
- No Python dependencies — pure `fetch()` in the Worker
- Free tier: 100,000 requests/day (sufficient for auth events)
- `garth` library stays for sync only (where it works well)

---

## What the Worker Does

The `garth` Python library is just a sequence of HTTP requests to Garmin's SSO.
The Worker replicates only the auth portion:

### Step 1 — Login (`POST /connect`)

```
POST https://sso.garmin.com/sso/embed
  params: service, webhost, source, redirectAfterAccountLoginUrl, ...
  body:   username, password, embed=true, _csrf=<extracted from page>

→ If MFA required: returns session_id to client
→ If no MFA: returns OAuth1 token directly
```

### Step 2 — MFA (`POST /mfa`)

```
POST https://sso.garmin.com/sso/verifyMFA/loginEnterMfaCode
  body: mfa=<user_code>, embed=true, _csrf=<from session>

→ Extracts ticket from response
→ POST https://connectapi.garmin.com/oauth-service/oauth/preauthorized
     params: ticket, login-url, accepts-mfa-tokens=true

→ Returns OAuth1 token (session_dump) to allerac-one
```

allerac-one receives the `session_dump` and stores it encrypted in `garmin_credentials`.
All subsequent sync calls use this token — no Worker involvement.

---

## Implementation Plan

### 1. New service: `services/garmin-auth-worker/`

```
services/garmin-auth-worker/
  src/
    index.ts        — Worker entrypoint
    garmin-sso.ts   — SSO HTTP flow (login, MFA, token exchange)
    types.ts        — Request/response types
  wrangler.toml     — CF Worker config (name, routes, secrets)
  package.json
```

### 2. Worker endpoints

```
POST /connect   { email, password }           → { status, session_id? }
POST /mfa       { session_id, mfa_code }      → { status, session_dump }
GET  /health    → 200 OK
```

Authentication between allerac-one and the Worker:
```
X-Worker-Secret: <shared secret>   (same pattern as health-worker)
```

### 3. Changes to `actions/health.ts`

Add `GARMIN_AUTH_WORKER_URL` env var.
`connectGarmin()` and `submitGarminMfa()` call the CF Worker instead of health-worker.
`triggerHealthSync()` continues calling health-worker (unchanged).

### 4. New environment variables

```
GARMIN_AUTH_WORKER_URL=https://garmin-auth.allerac.ai
GARMIN_AUTH_WORKER_SECRET=<shared secret>
```

### 5. Cloudflare Worker secrets (set via wrangler)

```
wrangler secret put WORKER_SECRET
```

### 6. Deploy

```bash
cd services/garmin-auth-worker
npm install
wrangler deploy
```

---

## Trade-offs

| | Detail |
|---|---|
| ✅ Solves IP rate limiting | Cloudflare edge IPs are diverse and not associated with a single cloud provider |
| ✅ No new infrastructure | Already use Cloudflare |
| ✅ Removes garth from auth path | Auth is pure fetch — no Python dependency |
| ✅ Sync unchanged | health-worker stays as-is |
| ⚠️ New Cloudflare dependency | Auth requires CF Worker to be healthy. Sync still works if Worker is down. |
| ⚠️ Garmin could block CF IPs | Less likely due to IP diversity, but not impossible |
| ⚠️ Replicates garth SSO flow | Must be maintained if Garmin changes their SSO flow |

---

## When to Implement

Implement this if either:
- Cloud IP rate limiting becomes a **recurring problem** after normal usage resumes
- The user base grows and multiple users hit the login block simultaneously

Do **not** implement preemptively — the current setup (health-worker on VM) works
correctly under normal usage patterns (one login per user, periodic sync).

---

## Related Files

- `services/health-worker/garmin.py` — current auth + sync (source for porting auth logic)
- `services/health-worker/app.py` — current FastAPI endpoints
- `src/app/actions/health.ts` — calls to health-worker (would add CF Worker calls here)
- `docs/health-migration-plan.md` — migration history
