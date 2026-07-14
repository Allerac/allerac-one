# Control API v1 Roadmap

## Status

In progress. As of 2026-07-14 the `/api/v1` contract covers `me`, `domains`,
`capabilities`, API keys, conversations (including synchronous message send),
memories, tickets, agent runs, documents, notes, scheduled jobs (including manual
run), skills, health, search, email, and finance — 41 route paths and 57 operations,
in sync with `docs/api/openapi/control-api-v1.yaml`. Browser session auth and scoped
bearer API keys are both implemented.

Remaining work: the `tools:run` contract, UI migration (Phase 6), app decoupling
preparation (Phase 7), and the streaming/async chat decision. See
`control-api-v1-gap-audit-2026-06-29.md` for the full gap analysis.

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
- [ADR 0002: Keep Control API in the app container initially](../architecture/decisions/0002-keep-control-api-in-app-container-initially.md)
- [Agent Background Execution Architecture](../agents/architecture.md)
- [Tickets Architecture](../tickets/architecture.md)

## Goal

Create a stable versioned API that becomes the control plane for Allerac One.

The first version should let non-browser clients operate real workflows without using
the web UI, while preserving the current app and deployment model.

## Current System Snapshot

As of 2026-07-14:

- `app` is still the main Next.js container and owns UI, API routes, server actions,
  service calls, auth/session resolution, and background runner startup.
- Existing browser-facing APIs live under `/api/*`.
- `/api/v1/*` routes exist for `me`, `domains`, `capabilities`, API keys,
  conversations (including synchronous message send), memories, tickets, agent runs,
  documents, notes, scheduled jobs, skills, health, search, email, and finance.
- Browser auth uses a `session_token` HTTP-only cookie and `requireCurrentUser()`.
- Headless auth uses scoped bearer API keys with the `alr_live_` token prefix.
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
| Control API helpers | `src/app/api/v1/_lib/*` | Session auth adapter, response envelopes, DTO mapping |
| Control API tickets | `src/app/api/v1/tickets/*` | Current session-authenticated `/api/v1` tickets slice |
| Tickets routes | `src/app/api/tickets/route.ts`, `src/app/api/tickets/[id]/route.ts` | Existing UI API surface |
| Tickets service | `src/app/services/tickets/ticket.service.ts` | Core ticket business logic; should be reused |
| Agent route | `src/app/api/agents/route.ts` | Existing UI/API surface for pending agent runs |
| Agent repository | `src/app/services/agents/worker-run.repository.ts` | Ownership-scoped run lookup and queue operations |
| Agent runner | `src/app/services/agents/worker-runner.service.ts` | Background polling/execution runtime |
| Memory service | `src/app/services/memory/conversation-memory.service.ts` | Conversation summary generation and owned memory lookup |
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
  tickets · agents · chat · domains · search · email · finance · jobs
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
Authorization: Bearer alr_live_<key>
```

The visible key prefix is not a security boundary. It only makes keys recognizable to
humans and easier to validate in input.

### Suggested API Key Format

```text
alr_live_<random>
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

Current note: the auth foundation now supports both browser sessions and scoped
bearer API keys. Key management still requires a browser session so users can
create/revoke credentials from an authenticated UI or session-backed API client.

Recommended first PR scope:

1. Add `api_keys` migration.
2. Add API key service.
3. Add API auth helper.
4. Add `/api/v1/me`.
5. Add tests.

Do not add tickets/agents in the same PR unless the auth slice is already complete and
well tested.

### Deliverables

- [x] Add migration for `control_api_keys`.
- [x] Store only key hashes, never raw API keys.
- [x] Show raw key only once when created.
- [x] Add API key service:
  - create key;
  - hash key;
  - verify key;
  - revoke key;
  - update `last_used_at`.
- [x] Add scoped auth helper for API routes.
- [x] Support both auth modes:
  - browser session cookie;
  - API key bearer token.
- [x] Add standard API error response helper.
- [x] Add tests for:
  - missing auth;
  - invalid key;
  - revoked key;
  - missing scope;
  - valid API key;
  - valid browser session.

### Suggested Files

New files:

```text
src/database/migrations/081_control_api_keys.sql
src/app/services/api-keys/api-key.service.ts
src/app/api/v1/_lib/auth.ts
src/app/api/v1/_lib/responses.ts
src/app/api/v1/me/route.ts
src/__tests__/services/api-keys/api-key.service.test.ts
src/__tests__/api/control-api-api-keys.test.ts
```

Existing files likely touched:

```text
src/app/services/auth/auth.service.ts
docs/roadmap/control-api-v1.md
docs/architecture/control-api-v1.md
```

### Proposed Table

```sql
control_api_keys (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
)
```

Recommended additions for operational safety:

```sql
CREATE UNIQUE INDEX control_api_keys_token_hash_idx ON control_api_keys(token_hash);
CREATE INDEX control_api_keys_user_created_idx ON control_api_keys(user_id, created_at DESC);
CREATE INDEX control_api_keys_active_prefix_idx ON control_api_keys(token_prefix)
  WHERE revoked_at IS NULL;
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
| `memory:read` | List owned memory summaries |
| `memory:write` | Create or delete owned memory summaries |
| `capabilities:read` | Read safe provider/integration capability status |
| `documents:read` | List owned documents |
| `documents:write` | Upload or delete owned documents |
| `notes:read` | List/search owned notes |
| `notes:write` | Create/update/delete owned notes |
| `jobs:read` | List jobs and executions |
| `jobs:write` | Create/update/toggle/delete/run owned jobs |
| `skills:read` | List/read skills |
| `skills:write` | Create/update/delete owned skills |
| `health:read` | Read health status and metrics |
| `search:read` | Run configured web search |
| `email:read` | List/read messages from owned email accounts |
| `email:write` | Send mail through owned email accounts |
| `finance:read` | Read market data and watchlist |
| `finance:write` | Add/remove watchlist symbols |

Keep `tools:run` and `settings:*` for later phases unless needed earlier.

### Exit Criteria

- [x] A non-browser client can call a protected `/api/v1` endpoint with `Authorization: Bearer <key>`.
- [x] A browser session can call the same endpoint without an API key.
- [x] A route can require a scope and deny keys without that scope.
- [x] No raw API key exists in Postgres.

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

- [x] Add `/api/v1/me`.
- [x] Add `/api/v1/domains`.
- [x] Scope `/api/v1/domains` with `domains:read` through API keys.
- [x] Return only domains accessible to the authenticated user.
- [x] Add tests for user visibility and admin visibility.

### Exit Criteria

- API key users can discover allowed domains.
- No inaccessible domain leaks through the response.
- Browser session behavior matches existing domain access rules.

## Phase 3: Tickets API Slice

Purpose: prove the Control API with a real product workflow.

Current status: the tickets slice is implemented for browser sessions and API keys.
Read routes require `tickets:read`; write routes require `tickets:write`.

### Endpoints

```text
GET    /api/v1/tickets
POST   /api/v1/tickets
GET    /api/v1/tickets/:id
PATCH  /api/v1/tickets/:id
GET    /api/v1/tickets/:id/events
DELETE /api/v1/tickets/:id
```

### Tasks

- [x] Add request/response schemas.
- [x] Use existing `TicketService`.
- [x] Map service errors to stable API errors.
- [x] Enforce `tickets:read` and `tickets:write` scopes through API keys.
- [x] Preserve existing `/api/tickets` routes for the UI.
- [x] Add dedicated `GET /api/v1/tickets/:id/events`.
- [x] Add session-authenticated contract tests for:
  - list own tickets;
  - create ticket;
  - update status;
  - read events;
  - read events through dedicated events endpoint;
  - unauthenticated access.
- [x] Add API-key contract tests for:
  - missing/wrong scope;
  - valid `tickets:read`;
  - valid `tickets:write`.

### Bruno Smoke Tests

The collection lives at:

```text
bruno/Allerac-One
```

Use the `Local` environment and set:

| Variable | Value |
|---|---|
| `baseUrl` | Local app URL, usually `http://localhost:8080` |
| `sessionToken` | Value of the browser `session_token` cookie |
| `ticketId` | Set automatically by the Create Ticket request |

Request order:

1. `System / Me`
2. `Tickets / List Tickets`
3. `Tickets / Create Ticket`
4. `Tickets / Get Ticket`
5. `Tickets / List Ticket Events`
6. `Tickets / Resolve Ticket`
7. `Tickets / Delete Ticket`

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

## Phase 3.5: Conversations API Slice

Purpose: expose conversation metadata and message history without committing to the
assistant message execution contract yet.

Current status: complete. List/create conversations, list messages, and synchronous
message send are implemented for browser sessions and API keys.
`POST /api/v1/conversations/:id/messages` persists the user message, runs the full
server-side chat pipeline through `ChatExecutionService`, persists the assistant
response, and returns the final assistant message plus aggregated execution events.
A streaming or async/polling contract remains an open decision.

### Endpoints

```text
GET  /api/v1/conversations
POST /api/v1/conversations
GET  /api/v1/conversations/:id/messages
POST /api/v1/conversations/:id/messages
```

### Tasks

- [x] Add request/response schemas.
- [x] Use existing `ChatService`.
- [x] Enforce `chat:read` and `chat:write` scopes.
- [x] Add contract tests for ownership and missing scope.
- [x] Design and implement synchronous `POST /api/v1/conversations/:id/messages`.

### Exit Criteria

- [x] A non-browser client can list owned conversations.
- [x] A non-browser client can create a conversation.
- [x] A non-browser client can read message history for an owned conversation.
- [x] Unowned conversations return `not_found`.

## Phase 4: Agent Runs API Slice

Purpose: expose background execution as a stable resource.

Current status: the first agent-runs slice is implemented for browser sessions and
API keys. It creates pending runs, lists owned runs, returns run details with workers,
and cancels owned active runs. Streaming remains deferred.

### Endpoints

```text
GET  /api/v1/agent-runs
POST /api/v1/agent-runs
GET  /api/v1/agent-runs/:id
POST /api/v1/agent-runs/:id/cancel
```

### Tasks

- [x] Add request/response schemas.
- [x] Use existing `WorkerRunRepository`.
- [x] Create pending runs without blocking HTTP.
- [x] Poll run state through `GET /api/v1/agent-runs/:id`.
- [x] Enforce `agents:read` and `agents:write` scopes.
- [x] Add contract tests for ownership and cancellation.

### Exit Criteria

- [x] A non-browser client can start an agent run and poll until completion/failure.
- [x] Cancelling a run is scoped to the owning user.
- [x] Existing `/api/agents` route continues to work.

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

## Phase 4.5: Memories API Slice

Purpose: expose reusable conversation summaries through the Control API without
mixing long-term memory operations into the conversation resource itself.

Current status: memory endpoints are implemented for browser sessions and API keys.
Read routes require `memory:read`; write routes require `memory:write`. Only memory
generation depends on an available Google or GitHub model provider configured in
system settings; listing and deleting existing memories remain database-only
operations.

### Endpoints

```text
POST   /api/v1/conversations/:id/memory
GET    /api/v1/memories
DELETE /api/v1/memories/:id
```

### Tasks

- [x] Add memory DTO mapping that hides database snake_case fields.
- [x] Reuse `ConversationMemoryService` instead of duplicating summary logic.
- [x] Check conversation ownership before generating a memory.
- [x] Enforce `memory:read` and `memory:write` scopes through API keys.
- [x] Return stable `422` errors for missing provider configuration and conversations
  without enough content.
- [x] Add Bruno smoke requests and OpenAPI contract entries.

### Exit Criteria

- [x] A non-browser client can create, list, and delete reusable memory summaries.
- [x] Memory remains a distinct API resource from conversations.
- [x] Current conversation UI behavior remains unchanged.

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

## Phase 8: Worker Separation (Architecture Phase 4)

Purpose: move the background agent-run runner out of the web-serving process so the
web app can serve requests while runs execute elsewhere, and restarting the web app
does not interrupt active runs. This is the first concrete step of app decoupling and
unblocks headless mode (architecture Phase 5).

Design decisions:

- The runner moves to a dedicated `agent-worker` container built from
  `Dockerfile.agent-worker` (esbuild bundle, same pattern as `Dockerfile.telegram`).
  Same-repo build means no code drift between app and worker.
- Coordination stays DB-only through `agent_runs` and `FOR UPDATE SKIP LOCKED`
  claiming — no route changes; multiple runner instances are safe.
- The scheduler logger stays in the `app` container (it feeds the /logs UI and is
  advisory-locked).
- Flag scheme (backwards compatible): `DISABLE_BACKGROUND_WORKERS=true` (legacy)
  disables both the in-app runner and the scheduler logger; `DISABLE_AGENT_RUNNER=true`
  (new, set by compose on `app`) disables only the runner. The worker entry ignores
  both flags.
- The worker exposes `GET /health` on `AGENT_WORKER_HEALTH_PORT` (default 8090)
  reporting runner status, active run count, and a DB ping, wired as the compose
  healthcheck.
- Graceful shutdown: SIGTERM stops polling, drains active runs up to
  `AGENT_WORKER_SHUTDOWN_TIMEOUT_MS` (default 25s), then exits; interrupted runs
  recover through the existing stale-run retry (5-minute window).

### Deliverables

- [x] `src/agent-worker.ts` entry script using the existing `WorkerRunnerService`.
- [x] `validateWorkerRuntimeConfig()` in `src/lib/runtime-config.ts` (worker does not
      require `TELEGRAM_TOKEN_ENCRYPTION_KEY`).
- [x] `Dockerfile.agent-worker` and an `agent-worker` compose service with explicit
      env contract, healthcheck, and `stop_grace_period`.
- [x] Two-flag gate in `src/instrumentation.ts`; compose sets
      `DISABLE_AGENT_RUNNER=true` on `app`.
- [x] `.env.example` documents the worker flags and `AGENT_WORKER_*` tuning vars.
- [x] Architecture doc Phase 4 updated with ownership statement and the `read_logs`
      caveat (agent runs now see only worker-container logs).

### Exit Criteria

Verified end-to-end on 2026-07-14 with local Docker (qwen2.5:3b via Ollama):

- [x] The web app serves requests while the worker handles agent runs.
- [x] Restarting the web app mid-run does not interrupt the active run (run completed
      normally while `app` restarted; worker health reported the active run
      throughout).
- [x] Restarting the worker mid-run recovers the run via stale-run retry (SIGTERM
      drained gracefully, "Retrying stale run" fired after the 5-minute window, run
      completed on the second attempt).
- [x] The app container no longer starts the runner; the scheduler logger still runs
      in the app.

## Deferred Work

- Tool execution API (`tools:run`).
- Streaming responses.
- OpenAPI generation.
- CLI packaging.
- Separate `api` container.
- Public docs publishing.

## Definition Of Done For Any Phase

- Code compiles.
- Focused tests exist for auth, ownership, and response shape.
- Existing UI behavior is not regressed.
- `mkdocs build --strict` passes.
- This roadmap is updated with completed tasks and any discovered constraints.
- If a new contract exists, the docs include at least one curl example.

## Recommended Next Ticket

Resolved 2026-07-14 — decisions recorded below and in the dated implementation note;
the chosen increment is Phase 8 (Worker Separation) above.

1. Streaming/async chat: deferred until a real client needs incremental tokens; the
   synchronous send endpoint covers CLI, automations, and Telegram.
2. `tools:run`: deferred until the tool permission model is explicit; tools remain
   reachable through chat and agent runs.
3. Next surface: worker separation (architecture Phase 4 / roadmap Phase 8).

Title:

```text
Decide the next Control API increment: chat streaming, tools:run, or worker separation
```

Description:

```text
The v1 resource surface is complete except tools:run. Before implementing more
endpoints, record decisions for the remaining high-judgment items from the
2026-06-29 gap audit:

1. Whether a streaming or async/polling chat contract is needed in addition to the
   synchronous POST /api/v1/conversations/:id/messages endpoint.
2. Whether tools:run becomes a standalone API or stays reachable only through chat
   and agent runs (depends on an explicit tool permission model).
3. Which surface comes next: workspace, social/Instagram, skill evaluation, or
   worker separation (architecture Phase 4).
```

Acceptance criteria:

- [ ] Each decision is recorded as an ADR or a dated entry in this roadmap.
- [ ] The chosen next surface has a phase section in this roadmap with endpoints,
      scopes, and exit criteria before implementation starts.

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

### 2026-06-24

- Phase 1 auth foundation was implemented with `control_api_keys`, hashed bearer
  tokens, session-only key management endpoints, and scoped API route auth.
- API key tokens use the `alr_live_` prefix. Raw secrets are returned only by the
  create-key response and are not stored.
- `/api/v1/me`, `/api/v1/domains`, and `/api/v1/tickets` now accept either browser
  sessions or API keys.
- `/api/v1/agent-runs` was implemented with list/create/detail/cancel endpoints.
- `/api/v1/capabilities`, synchronous conversation message execution, manual job run,
  search, email, and finance market-data reads were added after the initial slices.
- Current OpenAPI and handler counts are tracked in
  `docs/roadmap/control-api-v1-gap-audit-2026-06-29.md`.

### 2026-07-14

- The 2026-06-29 batch (capabilities, synchronous message send, job run-now, finance
  quotes/candles/symbol search, search, email) was committed with all six Control API
  test suites passing (56 tests).
- Architecture and roadmap docs were synced with the implemented surface: 41 route
  paths, 57 operations, matching the OpenAPI contract.
- Of the target route shape, only `POST /api/v1/tools/:name/run` remains
  unimplemented. Architecture Phase 4 (worker separation) and Phase 5 (headless mode)
  have not started; `WorkerRunnerService` still runs inside the `app` container.
- The stale "agent-runs" next ticket was replaced with a decision ticket covering
  streaming chat, `tools:run`, and the next surface.
- Decisions taken the same day: streaming/async chat deferred until a client needs
  it; `tools:run` deferred until the tool permission model is explicit; the next
  increment is worker separation (roadmap Phase 8, architecture Phase 4).
- Exploration confirmed the runner tree has zero Next.js runtime coupling and that
  run coordination is already DB-only (`FOR UPDATE SKIP LOCKED`), so no route changes
  are needed for the split. `Dockerfile.telegram` proves the services/tools tree
  bundles with esbuild using only `--external:pg-native`.
- Phase 8 (worker separation) was implemented and verified the same day: the
  `agent-worker` container claims and executes runs; app restarts mid-run do not
  interrupt execution; worker restarts recover runs via stale retry. The worker
  forwards console lines to the app /logs UI via `/api/log-submit` (`LOG_API_URL`).
  Known behavior change: `read_logs` inside agent runs sees only the worker's own
  local log buffer.
- Multi-tenant hardening, same day: the log buffer aggregates every user's activity,
  so `read_logs` is now admin-only (gated in `buildLogsTool(isAdmin)` and filtered
  from non-admin worker tool definitions) and `/api/log-submit` browser sessions now
  require admin (`requireCurrentAdmin`), closing a log-injection vector into the
  admin-only /logs monitor. Service callers keep using `EXECUTOR_SECRET`. Remaining
  known cross-tenant exposure: the app scheduler logger writes job result snippets of
  all users into the admin-visible buffer (acceptable under the trusted-operator
  model; revisit if log entries gain per-user attribution). The
  claim path (`SKIP LOCKED` in autocommit) leaves a small double-execution window if
  two runners ever run simultaneously; optional follow-up hardening is an atomic
  claim UPDATE.
