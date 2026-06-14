# Authentication — Technical Reference

This document describes the complete authentication implementation in Allerac One: session management, password-based login, Google OAuth, and the data model that ties them together.

## Table of Contents

1. [Overview](#overview)
2. [Data Model](#data-model)
3. [Session Management](#session-management)
4. [Email + Password Authentication](#email--password-authentication)
5. [Google OAuth](#google-oauth)
6. [Account Linking](#account-linking)
7. [Invite Token System](#invite-token-system)
8. [Authorization Layer](#authorization-layer)
9. [Key Files](#key-files)
10. [Environment Variables](#environment-variables)

---

## Overview

Allerac uses **session-based authentication** — no JWTs, no stateless tokens. Every authenticated request is validated against a `user_sessions` row in PostgreSQL.

Two authentication methods are supported:

| Method | Entry point | Notes |
|--------|-------------|-------|
| Email + password | `POST` via server action | Password pre-hashed on client with SHA-256 before transmission |
| Google OAuth 2.0 | `GET /api/auth/google` | Find-or-create; links to existing account if email matches |

Both methods produce the same result: a `session_token` cookie that identifies the user on subsequent requests.

---

## Data Model

### `users` table

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
email           TEXT UNIQUE NOT NULL
name            TEXT
password_hash   TEXT               -- NULL for Google-only accounts
password_hash_version INTEGER      -- 1 = legacy, 2 = current (bcrypt of SHA-256)
is_admin        BOOLEAN DEFAULT false
is_active       BOOLEAN DEFAULT true
google_id       TEXT UNIQUE        -- Google sub (subject) identifier
created_at      TIMESTAMPTZ DEFAULT NOW()
```

`password_hash` is nullable — users created via Google OAuth have no password and can only authenticate through Google.

`google_id` is the stable identifier from Google's `userinfo` endpoint (`profile.id`). It never changes even if the user updates their Google email.

### `user_sessions` table

```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
token       TEXT UNIQUE NOT NULL   -- 32 random bytes, hex-encoded
expires_at  TIMESTAMPTZ NOT NULL
created_at  TIMESTAMPTZ DEFAULT NOW()
```

Sessions expire after **7 days**. There is no sliding expiry — the expiry is fixed at creation time.

### `password_reset_tokens` table

```sql
user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
token       TEXT UNIQUE NOT NULL   -- 32 random bytes, hex-encoded
expires_at  TIMESTAMPTZ NOT NULL   -- 1 hour from creation
```

One active reset token per user. A new request replaces the previous token.

---

## Session Management

### Cookie

| Property | Value |
|----------|-------|
| Name | `session_token` |
| `httpOnly` | `true` |
| `secure` | `true` in production |
| `sameSite` | `lax` |
| Expiry | 7 days from login |
| Path | `/` |

### Validation flow

Every server action and API route that requires authentication calls `requireCurrentUser()`:

```
Request
  └─ cookies() → read session_token
       └─ pool.query → SELECT user from user_sessions JOIN users WHERE token = $1 AND expires_at > NOW()
            ├─ found  → return User object
            └─ not found → throw UnauthorizedError → 401 / redirect to /login
```

Source: `src/app/lib/auth-session.ts`

### First user

The first user registered (via email or Google) is automatically promoted to `is_admin = true`. All subsequent users are non-admin and receive access to the `chat` domain by default.

---

## Email + Password Authentication

### Password hashing scheme (v2)

Passwords are never transmitted in plaintext. The client applies SHA-256 before sending, and the server applies bcrypt on top:

```
Client:  sha256(plaintext_password)  →  transmitted hash
Server:  bcrypt(transmitted_hash, rounds=12)  →  stored in password_hash
```

This means even if the transmission layer is compromised, the attacker gets a SHA-256 hash — not the original password — and bcrypt still protects the stored value.

`password_hash_version = 2` identifies this scheme.

> **Legacy v1 accounts** stored `bcrypt(plaintext_password)`. These cannot authenticate with the v2 flow and are prompted to set a new password via the migration screen. Migration path: `AuthService.migratePassword()`.

### Login flow

```
LoginClient (browser)
  1. sha256(password)
  2. authActions.login(email, hashedPassword)   ← server action

AuthService.login()
  3. SELECT user WHERE email = $1
  4. check password_hash_version (reject v1, send to migration)
  5. bcrypt.compare(hashedPassword, stored_hash)
  6. createSession(user.id)  →  return token + expiresAt

actions/auth.ts
  7. cookies().set('session_token', token, { ... })
  8. getLoginRedirect()  →  admin → '/'  |  user → '/{first_domain}'
```

### Registration

New users can self-register if enabled. The first registered user becomes admin. Non-admin users automatically receive `chat` domain access.

### Password reset

1. User submits email → `requestPasswordReset(email)`
2. A 32-byte random token is stored in `password_reset_tokens` (1-hour TTL)
3. A reset link is sent via Resend: `${APP_URL}/reset-password?token=...`
4. User submits new password → `resetPassword(token, newHashedPassword)`
5. All existing sessions for the user are invalidated on success

---

## Google OAuth

### Flow

```
Browser
  1. GET /api/auth/google
       ├─ generate random state → store in cookie 'google_oauth_state' (10 min TTL)
       └─ redirect → accounts.google.com/o/oauth2/v2/auth?...

Google
  2. User authenticates + consents
  3. redirect → /api/auth/google/callback?code=...&state=...

Callback route
  4. validate state cookie (CSRF protection)
  5. POST oauth2.googleapis.com/token  →  access_token
  6. GET googleapis.com/oauth2/v2/userinfo  →  { id, email, name }
  7. AuthService.loginWithGoogle(id, email, name)
  8. cookies().set('session_token', ...)
  9. redirect → '/' (admin) or '/{domain}' (user)
```

### Scopes requested

```
openid email profile
```

These are non-sensitive scopes. No Google verification is required to publish the app for unrestricted use.

### Error handling

Errors are surfaced as URL parameters on the login page:

| Parameter | Cause |
|-----------|-------|
| `?error=google_denied` | User cancelled the Google consent screen |
| `?error=google_invalid_state` | CSRF state mismatch — possible replay attack |
| `?error=google_token_failed` | Code exchange with Google failed |
| `?error=google_profile_failed` | Could not fetch user profile from Google |
| `?error=google_no_email` | Google account has no verified email |
| `?error=google_login_failed` | Database error during find-or-create |
| `?error=google_not_configured` | `GOOGLE_CLIENT_ID` env var is missing |

---

## Account Linking

`AuthService.loginWithGoogle()` implements find-or-create with automatic linking:

```
loginWithGoogle(googleId, email, name)
  │
  ├─ SELECT WHERE google_id = $1
  │    └─ found → update email/name if changed → return existing account
  │
  ├─ SELECT WHERE email = $1
  │    └─ found → UPDATE SET google_id = $1 → link and return existing account
  │
  └─ not found → INSERT new user (no password_hash) → grant 'chat' domain access
```

**Consequence:** A user who previously registered with `email@gmail.com` + password and later signs in with Google using the same address will have their existing account linked automatically. They retain all their data, conversations, and domain access. From that point, both login methods work for the same account.

---

## Invite Token System

Allerac does not allow open self-registration. Non-admin users must be invited by an admin for a specific domain. The invite token system is a lightweight, single-use mechanism that controls exactly which domain a new user gets access to.

### Data model

```sql
-- migration 077_invite_tokens.sql
CREATE TABLE invite_tokens (
  token       TEXT PRIMARY KEY,              -- 32 random bytes, hex-encoded
  email       TEXT NOT NULL,                 -- invited email address (lowercase)
  domain_slug TEXT NOT NULL,                 -- the domain being granted
  used_at     TIMESTAMPTZ,                   -- NULL until consumed
  expires_at  TIMESTAMPTZ NOT NULL,          -- 7 days from creation
  created_by  UUID REFERENCES users(id),     -- admin who created it
  created_at  TIMESTAMPTZ DEFAULT NOW()
)
```

A token is valid when: `used_at IS NULL AND expires_at > NOW()`.

### Admin flow

1. Admin opens the **Admin → Users** tab
2. Fills in the invitee's email address and selects the domain
3. Clicks **Send invite**
4. `actions/invites.ts › createInvite(email, domainSlug)`:
   - Validates the domain exists and is active
   - Generates a 64-char hex token (32 random bytes)
   - Inserts a row in `invite_tokens` with a 7-day expiry
   - Sends an email via Resend with the link `{APP_URL}/join?token=<token>`
5. The invite table shows the invite status (pending / used / expired) with a **Revoke** button for pending ones

### User flow — email + password

```
User receives email → clicks /join?token=<token>

/join/page.tsx (server)
  1. validateInviteToken(token) — checks exists, not used, not expired
  2. Renders JoinClient with email pre-filled and locked

JoinClient (browser)
  3. User fills name + password
  4. registerWithInvite(token, email, hashedPassword, name)

actions/auth.ts
  5. validateInviteToken(token) — re-validates (race-condition safety)
  6. authService.register(email, password, name) — creates the user
  7. authService.consumeInviteToken(token, userId, email)
       ├─ Grants user_domain_access for the invite's domain_slug
       └─ Sets used_at = NOW()
  8. Sets session_token cookie
  9. Redirects to /{domain_slug}
```

### User flow — Google OAuth

The Google OAuth path stores the invite token in a short-lived cookie (`pending_invite`, 10-minute TTL) before starting the OAuth redirect, so the callback can consume it after the user authenticates.

```
JoinClient (browser)
  1. User clicks "Continue with Google"
  2. Sets cookie: pending_invite=<token>; max-age=600
  3. Redirects to /api/auth/google

/api/auth/google/route.ts
  4. Generates CSRF state cookie → redirects to accounts.google.com

/api/auth/google/callback/route.ts
  5. Validates state, exchanges code, fetches profile
  6. authService.loginWithGoogle(googleId, email, name) — find or create user
  7. Sets session_token cookie
  8. Reads pending_invite cookie → deletes it
  9. authService.consumeInviteToken(token, userId, profile.email)
       ├─ Validates email matches invite (if not, silently skips)
       ├─ Grants domain access
       └─ Sets used_at = NOW()
 10. Redirects to /{first_domain_slug}
```

> **Email matching for Google**: The Google account email must match the invited email. If the user authenticates with a different Google account, the token is not consumed (the user still logs in but gets their existing domain access, not the invited one).

### Key functions

| Function | Location | Purpose |
|----------|----------|---------|
| `createInvite(email, slug)` | `actions/invites.ts` | Admin-only: create token + send email |
| `validateInviteToken(token)` | `actions/invites.ts` | Public: check token validity |
| `listInvites()` | `actions/invites.ts` | Admin-only: list all invites |
| `revokeInvite(token)` | `actions/invites.ts` | Admin-only: delete unused token |
| `registerWithInvite(...)` | `actions/auth.ts` | Register + consume token in one step |
| `consumeInviteToken(token, userId, email)` | `AuthService` | Grant domain access + mark used |

---

## Authorization Layer

Authentication establishes *who* the user is. Authorization controls *what* they can access.

### Helpers (`src/app/lib/auth-session.ts`)

| Function | Behaviour |
|----------|-----------|
| `requireCurrentUser()` | Returns `User` or throws `UnauthorizedError` |
| `requireCurrentAdmin()` | Returns `User` or throws `ForbiddenError` |
| `assertDomainAccess(user, slug)` | Throws `ForbiddenError` if user lacks access to that domain |

### Domain access

Each non-admin user has explicit access to one or more domains via the `user_domain_access` join table. Admins have implicit access to all domains.

The post-login redirect uses `AuthService.getFirstDomainSlug(userId)` to send the user to their primary domain. If no domain is assigned, the user is redirected to `/login?error=no-access`.

---

## Key Files

```
src/
├── app/
│   ├── actions/
│   │   ├── auth.ts                        login, register, registerWithInvite, logout, reset
│   │   └── invites.ts                     createInvite, validateInviteToken, listInvites, revokeInvite
│   ├── lib/auth-session.ts                requireCurrentUser, requireCurrentAdmin, assertDomainAccess
│   ├── services/auth/auth.service.ts      AuthService — all DB operations, consumeInviteToken
│   ├── login/
│   │   ├── LoginClient.tsx                Login UI (email/password + Google button)
│   │   └── page.tsx                       Login page
│   ├── join/
│   │   ├── JoinClient.tsx                 Invite registration UI (email locked, password or Google)
│   │   └── page.tsx                       Invite landing page (validates token server-side)
│   └── api/auth/google/
│       ├── route.ts                       OAuth initiation (redirect to Google)
│       └── callback/route.ts             OAuth callback (code exchange, session + invite consumption)
└── database/migrations/
    ├── 076_google_oauth.sql               Adds google_id column to users
    └── 077_invite_tokens.sql              Creates invite_tokens table
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | For Google login | OAuth 2.0 client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | For Google login | OAuth 2.0 client secret |
| `APP_URL` | Yes | Full base URL including protocol, e.g. `https://app.allerac.ai` — used to build the OAuth redirect URI and password reset links |
| `RESEND_API_KEY` | For password reset | API key for sending reset emails via Resend |

### Google Cloud Console setup

1. APIs & Services → Credentials → Create OAuth 2.0 Client ID (type: Web application)
2. Authorized Redirect URIs: `https://{your-domain}/api/auth/google/callback`
3. OAuth consent screen: fill in app name, support email, developer contact email
4. For restricted access during testing: add test users in the OAuth consent screen
5. For unrestricted access: publish the app (no review needed for basic scopes)
