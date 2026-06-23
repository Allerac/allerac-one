# Control API v1 Roadmap

## Status

Planned. No `/api/v1` production contract exists yet.

## How To Use This Document

This document is the shared working memory for humans and agents building the Control
API. Start here before writing code.

When resuming this work:

1. Read this file.
2. Read the related architecture and ADR docs.
3. Check the current git diff and recent migrations.
4. Implement only the next unfinished phase unless explicitly asked otherwise.
5. Update this roadmap with discoveries, completed tasks, and changed assumptions.

This roadmap is intentionally more detailed than an ADR. ADRs explain decisions.
This file is the implementation trail.

## Related Docs

- [Architecture: Control API v1](../architecture/control-api-v1.md)
- [ADR 0001: Adopt Control API v1](../architecture/decisions/0001-adopt-control-api-v1.md)
- [Agent Background Execution Architecture](../agents/architecture.md)
- [Tickets Architecture](../tickets/architecture.md)

## Goal

Create a stable versioned API that becomes the control plane for Allerac One.

The first version should let non-browser clients operate real workflows without using
the web UI, while preserving the current app and deployment model.

## Current System Snapshot

As of 2026-06-23:

- `app` is still the main Next.js container and owns UI, API routes, server actions,
  service calls, auth/session resolution, and background runner startup.
- Existing browser-facing APIs live under `/api/*`.
- No `/api/v1/*` route exists yet.
- Browser auth uses a `session_token` HTTP-only cookie and `requireCurrentUser()`.
- Domain access is stored in `domains` and `user_domain_access`; admins bypass
  per-domain grants.
- Tickets already have a service boundary through `TicketService`.
- Agent runs already have a durable Postgres queue through `agent_runs`,
  `agent_workers`, `WorkerRunRepository`, and `WorkerRunnerService`.
- Docs are served by the `allerac-docs` Material for MkDocs container at
  `http://localhost:8000`, with source in `docs/`.

## Code Map

Use these files as the first reading path.

| Area | File | Notes |
|---|---|---|
| Session auth helper | `src/app/lib/auth-session.ts` | `requireCurrentUser`, `requireCurrentAdmin`, `assertDomainAccess`, current auth error shape |
| Page/domain access | `src/app/lib/domain-access.ts` | Redirect-oriented helper for pages, not suitable as-is for API key routes |
| Auth service | `src/app/services/auth/auth.service.ts` | Session validation and domain access checks |
| Domains route | `src/app/api/domains/route.ts` | Current browser/session-only domain discovery |
| Tickets routes | `src/app/api/tickets/route.ts`, `src/app/api/tickets/[id]/route.ts` | Existing UI API surface |
| Tickets service | `src/app/services/tickets/ticket.service.ts` | Core ticket business logic; should be reused |
| Agent route | `src/app/api/agents/route.ts` | Existing UI/API surface for pending agent runs |
| Agent repository | `src/app/services/agents/worker-run.repository.ts` | Ownership-scoped run lookup and queue operations |
| Agent runner | `src/app/services/agents/worker-runner.service.ts` | Background polling/execution runtime |
| Domain schema | `src/database/migrations/034_multi_tenancy.sql` | Creates `domains`, `user_domain_access`, `users.is_admin` |
| Ticket schema | `src/database/migrations/041_tickets.sql`, `080_ticket_number.sql` | Ticket tables and sequential numbers |
| Agent schema | `src/database/migrations/028_agent_runs.sql`, `029_agent_runs_pending_status.sql`, `043_agent_runs_skill_id.sql` | Agent run queue state |

## Working Invariants

These are the rules future implementation should preserve.

- `/api/v1` is additive at first. Do not break existing `/api/*` routes.
- Route handlers should not duplicate service logic.
- API key auth must never store raw keys.
- API key scopes are allow-lists, not labels for UI display only.
- Browser sessions and API keys should resolve to the same effective user shape.
- Ownership checks must happen before returning or mutating user data.
- Domain access rules must match existing `AuthService.canAccessDomain` behavior.
- Admin behavior must be explicit in tests.
- Return stable JSON envelopes from `/api/v1`; do not copy current ad hoc `/api/*`
  response shapes unless they are intentionally accepted.
- Prefer small, boring endpoints over broad generic endpoints.
- Keep the docs updated in the same PR that changes a Control API contract.

## Principles

- Keep the first slice small and shippable.
- Reuse existing services instead of duplicating business logic.
- Keep route handlers thin: auth, validation, service call, response mapping.
- Protect every route with ownership checks and scoped permissions.
- Prefer boring polling contracts before adding streaming or push.
- Keep existing UI routes working during migration.
- Do not split containers until contracts are stable enough to justify it.

## Target Shape

```text
Clients
  Web UI · Telegram · CLI · external automation
        |
        v
/api/v1
  auth · scopes · validation · stable JSON contracts
        |
        v
Services
  tickets · agents · chat · domains · tools · jobs
        |
        v
Runtime
  Postgres · executor · Ollama · provider APIs
```

## Proposed `/api/v1` Conventions

These conventions should be implemented before or during Phase 1 and then reused.

### Success Envelope

```json
{
  "data": {}
}
```

For list responses:

```json
{
  "data": [],
  "meta": {
    "limit": 50,
    "offset": 0
  }
}
```

### Error Envelope

```json
{
  "error": {
    "code": "missing_scope",
    "message": "API key does not have the required scope."
  }
}
```

Suggested first error codes:

| Code | Status | Meaning |
|---|---:|---|
| `unauthorized` | 401 | No valid session or API key |
| `forbidden` | 403 | Authenticated but not allowed |
| `missing_scope` | 403 | API key does not include required scope |
| `not_found` | 404 | Resource not found or not owned by user |
| `validation_error` | 400 | Request body/query failed validation |
| `internal_error` | 500 | Unexpected server failure |

### Authentication Header

Use bearer tokens for API keys:

```text
Authorization: Bearer allerac_<key>
```

The visible key prefix is not a security boundary. It only makes keys recognizable to
humans and easier to validate in input.

### Suggested API Key Format

```text
allerac_live_<random>
```

Store a cryptographic hash of the full key. If a lookup prefix is needed later, store
a short non-secret key prefix separately.

### Route Handler Shape

Use this structure consistently:

```text
parse request
resolve API user with required scope
validate input
call service/repository
map result to stable response DTO
return data/error envelope
```

## Phase 0: Documentation Baseline

Purpose: make the direction durable before implementation starts.

Tasks:

- [x] Create Control API architecture doc.
- [x] Create ADR 0001 for adopting Control API v1.
- [x] Create this roadmap.
- [x] Serve docs through Material for MkDocs container.
- [x] Add implementation tickets for Phase 1 in this roadmap.
- [ ] Create actual Allerac tickets for Phase 1 when implementation starts.

Exit criteria:

- The plan is visible in the docs site.
- Future sessions can resume from this roadmap without depending on chat context.

## Phase 1: API Auth Foundation

Purpose: create the minimum secure boundary for `/api/v1`.

Recommended first PR scope:

1. Add `api_keys` migration.
2. Add API key service.
3. Add API auth helper.
4. Add `/api/v1/me`.
5. Add tests.

Do not add tickets/agents in the same PR unless the auth slice is already complete and
well tested.

### Deliverables

- [ ] Add migration for `api_keys`.
- [ ] Store only key hashes, never raw API keys.
- [ ] Show raw key only once when created.
- [ ] Add API key service:
  - create key;
  - hash key;
  - verify key;
  - revoke key;
  - update `last_used_at`.
- [ ] Add scoped auth helper for API routes.
- [ ] Support both auth modes:
  - browser session cookie;
  - API key bearer token.
- [ ] Add standard API error response helper.
- [ ] Add tests for:
  - missing auth;
  - invalid key;
  - revoked key;
  - missing scope;
  - valid API key;
  - valid browser session.

### Suggested Files

New files:

```text
src/database/migrations/081_api_keys.sql
src/app/services/api-keys/api-key.service.ts
src/app/lib/api-auth.ts
src/app/lib/api-response.ts
src/app/api/v1/me/route.ts
src/__tests__/lib/api-auth.test.ts
src/__tests__/services/api-keys/api-key.service.test.ts
src/__tests__/api/v1-auth.test.ts
```

Existing files likely touched:

```text
src/app/services/auth/auth.service.ts
docs/roadmap/control-api-v1.md
docs/architecture/control-api-v1.md
```

### Proposed Table

```sql
api_keys (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
)
```

Recommended additions for operational safety:

```sql
CREATE UNIQUE INDEX api_keys_key_hash_idx ON api_keys(key_hash);
CREATE INDEX api_keys_user_id_idx ON api_keys(user_id);
CREATE INDEX api_keys_revoked_at_idx ON api_keys(revoked_at);
```

Optional later columns:

```sql
last_used_ip INET
expires_at TIMESTAMPTZ
```

### Initial Scopes

| Scope | Allows |
|---|---|
| `domains:read` | List accessible domains |
| `tickets:read` | List/read tickets and events |
| `tickets:write` | Create/update tickets |
| `agents:read` | Read agent run status/results |
| `agents:write` | Create/cancel agent runs |

Keep `chat:*`, `tools:run`, and `settings:*` for later phases unless needed earlier.

### Exit Criteria

- A non-browser client can call a protected `/api/v1` endpoint with `Authorization: Bearer <key>`.
- A browser session can call the same endpoint without an API key.
- A route can require a scope and deny keys without that scope.
- No raw API key exists in Postgres.

### Minimal Test Matrix

| Case | Expected |
|---|---|
| No session and no `Authorization` header | 401 |
| Malformed `Authorization` header | 401 |
| Unknown API key | 401 |
| Revoked API key | 401 |
| Valid API key missing required scope | 403 |
| Valid API key with required scope | 200 |
| Valid browser session | 200 |
| Browser session for inactive/deleted user | 401 |

## Phase 2: Domains Read API

Purpose: create a low-risk first endpoint and prove auth/scopes.

### Endpoints

```text
GET /api/v1/domains
GET /api/v1/me
```

### `/api/v1/me` Response Shape

```json
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "User",
      "isAdmin": false
    },
    "auth": {
      "type": "api_key",
      "scopes": ["domains:read"]
    }
  }
}
```

Do not return encrypted settings, raw API keys, provider tokens, or session tokens.

### Response Shape

```json
{
  "data": {
    "domains": [
      {
        "slug": "tickets",
        "displayName": "Tickets",
        "isActive": true,
        "defaultSkill": "tickets"
      }
    ]
  }
}
```

### Tasks

- [ ] Add `/api/v1/me`.
- [ ] Add `/api/v1/domains`.
- [ ] Scope `/api/v1/domains` with `domains:read`.
- [ ] Return only domains accessible to the authenticated user.
- [ ] Add tests for user ownership and admin visibility.

### Exit Criteria

- API key users can discover allowed domains.
- No inaccessible domain leaks through the response.
- Browser session behavior matches existing domain access rules.

## Phase 3: Tickets API Slice

Purpose: prove the Control API with a real product workflow.

### Endpoints

```text
GET    /api/v1/tickets
POST   /api/v1/tickets
GET    /api/v1/tickets/:id
PATCH  /api/v1/tickets/:id
GET    /api/v1/tickets/:id/events
```

### Tasks

- [ ] Add request/response schemas.
- [ ] Use existing `TicketService`.
- [ ] Map service errors to stable API errors.
- [ ] Enforce `tickets:read` and `tickets:write` scopes.
- [ ] Preserve existing `/api/tickets` routes for the UI.
- [ ] Add contract tests for:
  - list own tickets;
  - cannot read another user's ticket;
  - create ticket;
  - update status;
  - read events;
  - missing/wrong scope.

### Exit Criteria

- A curl/CLI client can create, list, update, and inspect tickets without the web UI.
- Current Tickets UI continues to work unchanged.
- All ticket routes enforce user ownership.

### Response DTO Notes

Avoid leaking internal field naming. Convert database/service casing into API casing:

```json
{
  "data": {
    "ticket": {
      "id": "uuid",
      "number": 42,
      "title": "Fix login redirect",
      "type": "bug",
      "status": "open",
      "priority": {
        "level": "medium",
        "score": 55
      },
      "createdAt": "2026-06-23T20:00:00.000Z",
      "updatedAt": "2026-06-23T20:00:00.000Z"
    }
  }
}
```

## Phase 4: Agent Runs API Slice

Purpose: expose background execution as a stable resource.

### Endpoints

```text
GET  /api/v1/agent-runs
POST /api/v1/agent-runs
GET  /api/v1/agent-runs/:id
POST /api/v1/agent-runs/:id/cancel
```

### Tasks

- [ ] Add request/response schemas.
- [ ] Use existing `WorkerRunRepository`.
- [ ] Create pending runs without blocking HTTP.
- [ ] Poll run state through `GET /api/v1/agent-runs/:id`.
- [ ] Enforce `agents:read` and `agents:write` scopes.
- [ ] Add contract tests for ownership and cancellation.

### Exit Criteria

- A non-browser client can start an agent run and poll until completion/failure.
- Cancelling a run is scoped to the owning user.
- Existing `/api/agents` route continues to work.

### Agent Run DTO Notes

The current `/api/agents` route returns UI-oriented fields. `/api/v1` should return a
stable resource shape:

```json
{
  "data": {
    "agentRun": {
      "id": "uuid",
      "status": "running",
      "prompt": "...",
      "model": "claude-haiku-4-5-20251001",
      "provider": "anthropic",
      "result": null,
      "error": null,
      "createdAt": "2026-06-23T20:00:00.000Z",
      "completedAt": null
    }
  }
}
```

## Phase 5: First Vertical Slice

Purpose: prove that the Control API is useful before broadening it.

### Scenario

```text
1. Create API key with domains:read, tickets:read, tickets:write, agents:read, agents:write.
2. Call GET /api/v1/domains.
3. Create a ticket through POST /api/v1/tickets.
4. Start an agent run through POST /api/v1/agent-runs.
5. Poll GET /api/v1/agent-runs/:id.
6. Patch the ticket with the final result/status.
```

### Exit Criteria

- The full scenario works with curl or a small script.
- No browser UI is required.
- The current UI still works.
- The docs include example commands.

## Phase 6: UI Migration Candidates

Purpose: reduce duplicate surfaces after the API has proven itself.

Candidates:

- Tickets UI can use `/api/v1/tickets`.
- Agent run polling can use `/api/v1/agent-runs`.
- Domain discovery can use `/api/v1/domains`.

Do not migrate chat UI until the chat API contract is designed separately.

Migration rule: migrate one UI surface at a time and keep the old `/api/*` route until
the replacement is tested in production-like Docker.

## Phase 7: App Decoupling Preparation

Purpose: prepare for container/process separation after API contracts stabilize.

Tasks:

- [ ] Document current `app` responsibilities.
- [ ] Identify runtime code that should move to an `agent-worker` process.
- [ ] Identify routes that are UI-only versus API control-plane routes.
- [ ] Decide whether `/api/v1` remains in Next.js or moves to a separate API service later.
- [ ] Add healthchecks for API and worker responsibilities separately.

Exit criteria:

- There is a clear split plan for:
  - web UI;
  - Control API;
  - agent worker;
  - specialized services.

## Deferred Work

- Chat API.
- Tool execution API.
- Streaming responses.
- OpenAPI generation.
- CLI packaging.
- Separate `api` container.
- Separate `agent-worker` container.
- Public docs publishing.

## Definition Of Done For Any Phase

- Code compiles.
- Focused tests exist for auth, ownership, and response shape.
- Existing UI behavior is not regressed.
- `mkdocs build --strict` passes.
- This roadmap is updated with completed tasks and any discovered constraints.
- If a new contract exists, the docs include at least one curl example.

## Recommended Next Ticket

Title:

```text
Implement Control API v1 auth foundation
```

Description:

```text
Add scoped API key authentication for /api/v1 while preserving existing browser
session auth. Implement api_keys migration, API key service, API auth helper,
standard response/error helpers, and GET /api/v1/me as the first protected endpoint.
Do not implement tickets or agents in this ticket.
```

Acceptance criteria:

- [ ] `api_keys` table stores only hashed keys.
- [ ] Raw key is returned only by the create-key operation.
- [ ] `GET /api/v1/me` works with a browser session.
- [ ] `GET /api/v1/me` works with a valid API key.
- [ ] Missing/invalid/revoked keys return 401.
- [ ] Valid keys missing a required scope return 403 where a scope is required.
- [ ] Tests cover the auth matrix in Phase 1.
- [ ] Docs are updated with the implemented auth behavior.

## Implementation Notes

Use this section to append discoveries while building.

### 2026-06-23

- Control API docs and ADR were created before implementation.
- Docs are served locally by the `allerac-docs` MkDocs Material container.
- The first implementation target should be API key auth plus `GET /api/v1/domains`.
- Existing routes return ad hoc shapes such as `{ visible }`, `{ tickets }`, and
  `{ runId }`. `/api/v1` should not inherit those shapes by accident.
- Existing `requireCurrentUser()` is cookie-only. API key support should live in a new
  helper rather than overloading browser-only page helpers.
