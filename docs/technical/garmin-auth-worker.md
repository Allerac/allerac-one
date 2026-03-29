# Garmin Auth Worker

## Problem

Garmin blocks with 429 the **entire SSO authentication flow** when requests come from cloud provider IPs (AWS, GCP, Azure, VMs). This includes:

- `sso.garmin.com/sso/embed` — initial cookies
- `sso.garmin.com/sso/signin` — CSRF token + credentials submission
- `sso.garmin.com/sso/verifyMFA/loginEnterMfaCode` — MFA
- `connectapi.garmin.com/oauth-service/oauth/preauthorized` — OAuth1 token
- `connectapi.garmin.com/oauth-service/oauth/exchange/user/2.0` — OAuth2 exchange

## Solution

A Cloudflare Worker that executes the **complete login flow** from Cloudflare edge IPs, which Garmin does not block. The Python `health-worker` never makes direct requests to Garmin — it only orchestrates calls to the Worker.

```
Before:  health-worker (VM IP) → sso.garmin.com / connectapi.garmin.com  ❌ 429

After:   health-worker → CF Worker (edge IP) → sso.garmin.com            ✅
                                              → connectapi.garmin.com     ✅
```

## Architecture

### Flow without MFA

```
allerac-one → health-worker
                   │
         POST /login-start {email, password}
                   │
              CF Worker executes:
              1. GET sso.garmin.com/sso/embed       (cookies)
              2. GET sso.garmin.com/sso/signin      (CSRF token)
              3. POST sso.garmin.com/sso/signin     (credentials)
              4. GET connectapi.../preauthorized    (OAuth1 token)
              5. POST connectapi.../exchange        (OAuth2 token)
                   │
              { mfa_required: false, tokens: { oauth1, oauth2 } }
                   │
         garmin.py rebuilds session_dump
         and stores it encrypted in PostgreSQL
```

### Flow with MFA

```
allerac-one → health-worker
                   │
         POST /login-start {email, password}
                   │
              CF Worker executes steps 1-3
              Garmin requires MFA → stops here
                   │
              { mfa_required: true, state: { cookies, mfa_csrf } }
                   │
         health-worker stores state in memory
         returns session_id to allerac-one
                   │
         [User receives email, reads code]
                   │
         POST /login-complete {state, mfa_code}
                   │
              CF Worker executes:
              4. POST sso.garmin.com/verifyMFA/...  (MFA code)
              5. GET connectapi.../preauthorized    (OAuth1 token)
              6. POST connectapi.../exchange        (OAuth2 token)
                   │
              { tokens: { oauth1, oauth2 } }
                   │
         garmin.py rebuilds session_dump
         and stores it encrypted in PostgreSQL
```

The Worker is **stateless** — the intermediate MFA state (cookies + CSRF token) is returned to `health-worker` and sent back in the second call. The Worker stores nothing.

## Files

```
services/garmin-auth-worker/
  src/index.ts      — Worker TypeScript: full SSO flow + OAuth1/2
  wrangler.toml     — Cloudflare Worker config
  package.json
  tsconfig.json

services/health-worker/garmin.py
  — authenticate(): calls /login-start, stores state if MFA required
  — complete_mfa(): calls /login-complete with state + code
  — fetch_metrics(): uses session_dump, unchanged
  — direct garth fallback if AUTH_WORKER_URL is not set
```

## Worker Endpoints

### `GET /health`
```
Response 200: { "status": "ok", "time": "...", "version": "..." }
```

### `POST /login-start`
```
Headers: X-Worker-Secret: <secret>
Body:    { "email": "...", "password": "..." }

Response 200 (no MFA):   { "mfa_required": false, "tokens": { "oauth1": {...}, "oauth2": {...} } }
Response 200 (MFA):      { "mfa_required": true, "state": { "cookies": {...}, "mfa_csrf": "..." } }
Response 400: { "error": "..." }   — invalid credentials or unexpected page
Response 500: { "error": "..." }   — internal error (e.g. rate limit, network failure)
```

### `POST /login-complete`
```
Headers: X-Worker-Secret: <secret>
Body:    { "state": <state returned by /login-start>, "mfa_code": "123456" }

Response 200: { "tokens": { "oauth1": {...}, "oauth2": {...} } }
Response 400: { "error": "MFA failed, page: ..." }
Response 500: { "error": "..." }
```

## Deployment

> **Note:** Deployment must be done from a machine with browser access (for the first wrangler OAuth login), or using a Cloudflare API token.

### 1. Authenticate wrangler via API token (recommended for VMs)

```bash
# Create at: dash.cloudflare.com/profile/api-tokens
# Template: "Edit Cloudflare Workers"
export CLOUDFLARE_API_TOKEN=<token-from-dashboard>
```

### 2. Deploy the Worker

```bash
cd services/garmin-auth-worker
npm install
npx wrangler deploy
# Output: https://garmin-auth-worker.<account>.workers.dev
```

### 3. Set the WORKER_SECRET

```bash
# Generate a strong secret
openssl rand -hex 32

# Set it in the Worker (wrangler will prompt for the value)
npx wrangler secret put WORKER_SECRET
```

### 4. Add to `.env`

```env
AUTH_WORKER_URL=https://garmin-auth-worker.<account>.workers.dev
AUTH_WORKER_SECRET=<same value configured in wrangler>
```

### 5. Rebuild health-worker

```bash
docker compose -f docker-compose.local.yml up -d --build health-worker
```

### 6. Verify

```bash
curl https://garmin-auth-worker.<account>.workers.dev/health
# { "status": "ok", ... }
```

## Security

- `X-Worker-Secret` — only the `health-worker` can call the Worker
- Credentials (email/password) pass through the Worker but are **never stored** — the Worker is stateless
- The MFA `state` contains SSO session cookies and a CSRF token — expires within minutes with the Garmin session
- OAuth tokens stored in PostgreSQL encrypted with AES-256-GCM (`oauth1_token_encrypted`, `oauth2_token_encrypted`)
- If the Worker is down: login fails with a clear error; sync (which uses the already-stored token) is not affected

## Rate Limiting

Garmin applies aggressive rate limiting on the SSO by IP. Too many login attempts in a short period can temporarily block Cloudflare edge IPs. In that case:

- Wait 1-2 hours before retrying
- The typical error is a `429` in the response body (not in the HTTP status)
- The Worker detects it and returns `"Garmin rate limit (429). Try again in a few minutes."`

## Reuse in Other Contexts

This pattern — **CF Worker as an authentication intermediary for services that block cloud IPs** — applies to any service with the same problem:

1. Create a TypeScript Worker that replicates the target service's HTTP flow
2. Manage cookies and redirects manually (see `garminFetch` in `src/index.ts`)
3. Split flows requiring user input (MFA, 2FA) into two endpoints: `/start` and `/complete`
4. Intermediate state is returned to the caller and sent back in the second call — the Worker remains stateless

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `AUTH_WORKER_URL` | `.env` / `health-worker` | CF Worker URL |
| `AUTH_WORKER_SECRET` | `.env` / `health-worker` | Shared secret to authenticate Worker calls |
| `WORKER_SECRET` | CF Worker (wrangler secret) | Same value as `AUTH_WORKER_SECRET` |
| `CLOUDFLARE_API_TOKEN` | Deploy only (not in `.env`) | Dashboard token to authenticate wrangler |
