# ADR 0003: Expose Control API Through Cloudflare Path Policy

## Status

Accepted

## Date

2026-07-15

## Context

ADR 0001 establishes `/api/v1` as the stable Allerac control plane for browser and
non-browser clients. ADR 0002 keeps that Control API inside the existing `app`
container while contracts mature. This means production deployments currently serve
both the browser UI and `/api/v1` from the same origin, such as
`https://app.allerac.ai`.

The first Android robot client is now using the Control API with a scoped bearer API
key. The web UI is also expected to migrate to the new API contracts over time. That
creates a public edge requirement:

- browser users need normal UI protection, session cookies, and interactive login;
- robot, mobile, CLI, and automation clients need JSON API access with
  `Authorization: Bearer alr_live_...`;
- Cloudflare browser challenges, Access login pages, bot challenges, and caching can
  break non-browser API clients;
- bypassing Cloudflare entirely with direct VM/IP access would weaken the deployment
  model and create a second production URL shape;
- the future `api` container extraction should not force clients to change auth
  semantics or API contracts.

## Decision

Expose the Control API through Cloudflare using path-specific policy.

The production edge should treat the browser UI and Control API differently even
while both are served by the same `app` container:

```text
https://app.allerac.ai/
  Browser UI, login, static assets, existing browser workflows.

https://app.allerac.ai/api/v1/*
  Stable Control API for web, mobile, robot, CLI, and automation clients.
```

For `/api/v1/*`, Cloudflare should:

- allow JSON API requests from non-browser clients;
- pass the `Authorization` header through to the origin;
- not require an interactive Cloudflare Access login;
- not issue Managed Challenge, JS Challenge, Turnstile, or Bot Fight challenges;
- not cache API responses;
- allow the HTTP methods used by the OpenAPI contract, including `GET`, `POST`,
  `PATCH`, and `DELETE`;
- apply API-appropriate protections such as TLS, request size limits, rate limiting,
  logging, and coarse abuse filtering.

Authentication and authorization for `/api/v1` remain owned by Allerac:

- browser clients may use the existing `session_token` cookie;
- non-browser clients must use scoped bearer API keys;
- each physical or automation client should get its own individually revocable key;
- keys for kiosk or robot clients should use the narrowest scopes that work.

The recommended robot key scopes for the current Android client are:

```text
chat:read
chat:write
```

Add `capabilities:read` only when the client renders deployment capability status.

Do not use direct VM/IP URLs for normal client operation. Direct origin access is
only acceptable as a temporary diagnostic path. The normal production base URL for
clients is the HTTPS Cloudflare hostname.

When the Control API is eventually extracted into its own `api` container, the same
edge policy and API authentication model should continue to apply. A dedicated
hostname such as `https://api.allerac.ai` may be introduced later, but it is not
required for the first robot/mobile client.

## Consequences

### Positive

- The robot and future mobile app can use the same production hostname as the web UI.
- The Control API remains the single integration surface instead of creating a
  direct-origin exception for devices.
- Cloudflare can still protect the deployment without breaking API clients.
- The future `api` container split remains compatible with existing clients.
- Per-device API keys stay meaningful because Allerac, not Cloudflare, owns resource
  scopes and user ownership checks.

### Negative

- Cloudflare configuration now becomes part of the production API contract.
- A wrong Cloudflare rule can break non-browser clients even when Allerac is healthy.
- Rate limiting must be designed carefully so voice clients are not blocked during
  normal conversation loops.
- If Cloudflare Access is enabled globally, `/api/v1/*` needs an explicit bypass or
  a non-interactive service-token design.

### Neutral

- The Control API still lives in the `app` container for now.
- Existing browser routes and legacy `/api/*` routes may continue to coexist during
  migration.
- API key scopes remain the primary least-privilege mechanism for non-browser
  clients.

## Operational Rules

Recommended Cloudflare rules for `app.allerac.ai`:

| Path | Policy |
|---|---|
| `/api/v1/*` | No cache, no interactive challenge, pass `Authorization`, rate limit as API traffic |
| Browser UI paths | Normal browser security policy, login/session behavior, WAF as appropriate |
| Legacy `/api/*` | Keep existing behavior unless a route is migrated to v1 or used by a known non-browser client |

Before pointing a new non-browser client at production, smoke-test:

1. `GET /api/v1/me` with the client API key.
2. `GET /api/v1/domains` if the key has `domains:read`.
3. `POST /api/v1/conversations` with `chat:write`.
4. `POST /api/v1/conversations/:id/messages` with `chat:write`.
5. Revoke the key and verify the client receives `401 unauthorized`.

## Alternatives Considered

### Expose The VM Directly

Rejected for normal operation. It bypasses the production edge, requires firewall
exceptions, creates a second public URL pattern, and makes TLS/security behavior less
consistent across clients.

### Put Cloudflare Access In Front Of All Routes

Rejected for `/api/v1/*` in its browser-interactive form. It protects the UI well,
but it breaks simple bearer-token clients unless every client also implements the
Cloudflare Access service-token flow. That may be useful later for service-to-service
traffic, but it should not replace Allerac API key authorization for device clients.

### Create A Separate API Container Now

Rejected for this decision. ADR 0002 already defers the container split until the
Control API contracts are more mature. Path-specific Cloudflare policy gives the
required client boundary without forcing a runtime split.

### Use A Separate `api.allerac.ai` Hostname Immediately

Deferred. A separate hostname is compatible with this ADR and may be introduced when
it simplifies operations or when the `api` container exists. It is not required for
the first robot client because `/api/v1/*` is already a stable path boundary.
