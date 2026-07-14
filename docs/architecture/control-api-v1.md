# Allerac Control API v1

## Status

In progress. As of 2026-07-14 the `/api/v1` surface covers system (`me`, `domains`,
`capabilities`), API keys, conversations (including synchronous message execution),
memories, tickets, agent runs, documents, notes, scheduled jobs (including manual
run), skills, health, search, email, and finance. Browser session auth and scoped
bearer API keys are both supported.

Of the initial resources below, only `tools` (`POST /api/v1/tools/:name/run`) remains
unimplemented. Phases 1-3 are complete; Phase 4 (worker separation) and Phase 5
(headless mode) have not started. The full implemented contract is tracked in
`docs/api/openapi/control-api-v1.yaml` and audited in
`docs/roadmap/control-api-v1-gap-audit-2026-06-29.md`.

## Purpose

Allerac One currently runs as a Next.js application where the browser UI, API routes,
server actions, business services, and background runtime all live behind the `app`
container. That has kept deployment simple, but it also makes the web UI the natural
center of gravity for the product.

The Control API v1 moves Allerac toward a platform shape:

- the API becomes the stable control plane;
- the web UI becomes one client of that API;
- Telegram, CLI, mobile, external automations, and headless deployments can use the
  same contracts;
- workers and specialized containers can be split out gradually without changing
  product behavior.

This is intentionally incremental. The first version should wrap existing services
and data models, not rewrite them.

## Platform Model

```
Clients
  Web UI · Telegram · CLI · Mobile · External automation
        |
        v
Allerac Control API v1
  Auth · resource contracts · validation · audit boundary
        |
        v
Core services
  Chat · agents · tickets · domains · search · email · finance · jobs
        |
        v
Runtime services
  Postgres · executor · Ollama · health-worker · provider APIs
```

The useful analogy is Kubernetes: clients talk to a control plane, controllers observe
desired state, and workers reconcile work in the background. For Allerac, Postgres is
the durable state store, `/api/v1` is the control plane, and agent/job workers are the
controllers.

## Non-Goals

- Do not split the app container on day one.
- Do not replace the existing UI routes immediately.
- Do not introduce a new queue or service mesh just to create the API.
- Do not duplicate business logic inside route handlers.
- Do not expose unstable internal tables directly as public API.

## Initial Resources

The first API version should focus on resources that already exist and have clear
service boundaries.

| Resource | Purpose | Existing backing |
|---|---|---|
| `conversations` | Create/list conversations and read message history | `ChatService`, `chat_conversations`, `chat_messages` |
| `memories` | Create/list/delete reusable conversation summaries | `ConversationMemoryService`, `conversation_summaries` |
| `messages` | Send a user message and receive/poll assistant output | chat pipeline, LLM service, tools |
| `agent-runs` | Create/poll/cancel background agent runs | `WorkerRunRepository`, `WorkerRunnerService` |
| `tickets` | Create/list/update tickets and read events | `TicketService`, `tickets`, `ticket_events` |
| `domains` | Discover available domains and active skill defaults | domain access tables, skill defaults |
| `capabilities` | Read safe provider/integration availability | user settings, system settings, environment |
| `search` | Run configured web search | `SearchWebTool`, Tavily settings/cache |
| `email` | Read/send through owned email accounts | IMAP/SMTP services, `user_email_accounts` |
| `finance` | Read market data and manage watchlist | Yahoo-backed market data, `user_watchlist` |
| `tools` | Run approved tools through a scoped API boundary | chat/tool registry |
| `jobs` | Create/list/run scheduled or ad hoc jobs | jobs domain services |

## Route Shape

Use a versioned namespace for contracts intended to outlive the current UI:

```text
GET    /api/v1/domains
GET    /api/v1/me
GET    /api/v1/conversations
POST   /api/v1/conversations
GET    /api/v1/conversations/:id/messages
POST   /api/v1/conversations/:id/messages
POST   /api/v1/conversations/:id/memory
GET    /api/v1/memories
DELETE /api/v1/memories/:id

GET    /api/v1/agent-runs
POST   /api/v1/agent-runs
GET    /api/v1/agent-runs/:id
POST   /api/v1/agent-runs/:id/cancel

GET    /api/v1/tickets
POST   /api/v1/tickets
GET    /api/v1/tickets/:id
PATCH  /api/v1/tickets/:id
GET    /api/v1/tickets/:id/events

POST   /api/v1/tools/:name/run
```

Existing `/api/*` routes may continue to serve the UI while `/api/v1/*` is introduced.
Over time, UI code should migrate to the same contracts where practical.

### Implemented Surface

The implemented surface has grown well beyond the initial slice. It supports both
browser sessions and scoped API keys across:

- System: `GET /api/v1/me`, `GET /api/v1/domains`, `GET /api/v1/capabilities`
- API keys: list, create, revoke
- Conversations: list, create, list messages, synchronous message send
- Memories: create from conversation, list, delete
- Tickets: list, create, get, update, events, delete
- Agent runs: list, create, get, cancel
- Documents: list, upload, delete
- Notes: list, create, search, tags, update, delete
- Scheduled jobs: list, create, update, toggle, executions, run now, delete
- Skills: list, get, create, update, delete
- Health: status, summary, daily, activities
- Search: web search
- Email: list messages, get message, send
- Finance: quotes, symbol search, candles, watchlist list/add/remove

The authoritative contract is `docs/api/openapi/control-api-v1.yaml`. Of the target
route shape above, only `POST /api/v1/tools/:name/run` remains unimplemented; it is
deliberately deferred until the tool permission model is explicit.

This proves the route shape, Zod validation, response envelopes, domain access, DTO
mapping, API key auth, scoped route checks, and Bruno smoke tests without changing the
current web UI.

## Authentication

The API needs browser and non-browser authentication.

### Browser Clients

Browser UI can continue using the existing session cookie. `/api/v1` routes should be
able to resolve the current user through the same session validation used by existing
routes.

The initial `/api/v1` implementation keeps this mode so the browser UI and Bruno can
test the same contracts with the existing `session_token` cookie.

### Headless Clients

Non-browser clients use API keys with explicit scopes.

Suggested first table:

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

Store only hashes. Show the raw key once at creation time.

Suggested first scopes:

| Scope | Allows |
|---|---|
| `domains:read` | List accessible domains |
| `chat:read` | Read conversations/messages |
| `chat:write` | Create conversations/send messages |
| `agents:read` | Read agent run status/results |
| `agents:write` | Create/cancel agent runs |
| `memory:read` | List owned memory summaries |
| `memory:write` | Create or delete owned memory summaries |
| `tickets:read` | List/read tickets and events |
| `tickets:write` | Create/update tickets |
| `tools:run` | Execute approved tools |
| `capabilities:read` | Read non-secret provider/integration capability status |
| `documents:read` / `documents:write` | List/upload/delete documents |
| `notes:read` / `notes:write` | List/search/create/update/delete notes |
| `jobs:read` / `jobs:write` | List/manage/run scheduled jobs |
| `skills:read` / `skills:write` | List/manage skills |
| `health:read` | Read Garmin-backed health data |
| `search:read` | Run configured web search |
| `email:read` / `email:write` | Read/send through owned email accounts |
| `finance:read` / `finance:write` | Read market data and manage watchlist |

Admin and system-level scopes should wait until there is a concrete use case.

## Contract Rules

- Validate request bodies and query params with Zod or an equivalent schema layer.
- Return stable JSON envelopes.
- Use consistent error shapes:

```json
{
  "error": {
    "code": "ticket_not_found",
    "message": "Ticket not found"
  }
}
```

- Never return raw encrypted secrets.
- Enforce user ownership at the API boundary and again in service queries where the
  service already supports it.
- Prefer IDs in paths and filters in query params.
- Keep route handlers thin: auth, validation, service call, response mapping.

## Implementation Phases

### Phase 1: API Auth Foundation

Status: complete.

Goal: `/api/v1` can authenticate either browser sessions or scoped API keys.

Deliverables:

- `control_api_keys` migration.
- API key creation/revocation service.
- Hashing and lookup logic.
- `requireApiUser(scope)` helper for `/api/v1`.
- Tests for missing, revoked, wrong-scope, and valid keys.

Exit criteria:

- A non-browser client can call `/api/v1/me`, `/api/v1/domains`, and `/api/v1/tickets`.
- Existing browser sessions still work.
- No raw API key is stored in Postgres.

### Phase 2: Tickets and Agent Runs

Status: complete.

Goal: prove the control-plane model with resources that already have strong backing
services and immediate operational value.

Deliverables:

- `GET/POST/PATCH /api/v1/tickets`.
- `GET /api/v1/tickets/:id/events`.
- `POST/GET /api/v1/agent-runs`.
- `POST /api/v1/agent-runs/:id/cancel`.
- Contract tests for ownership and scope enforcement.

Exit criteria:

- A CLI or curl client can create a ticket, start an agent run, poll it, and update the
  ticket without using the web UI.
- The current web UI can remain unchanged.

### Phase 3: Chat API

Status: complete for the synchronous contract. `POST /api/v1/conversations/:id/messages`
runs the full server-side chat pipeline and returns the final assistant message plus
aggregated execution events. A streaming or async/polling contract remains an open
decision.

Goal: make chat usable by API clients without depending on React or Server Actions.

Deliverables:

- Conversation create/list/detail endpoints.
- Message send endpoint.
- Polling contract for assistant response and tool events.
- Shared response mapping used by UI and non-UI clients.

Exit criteria:

- A headless client can run a complete conversation.
- The UI can begin migrating from bespoke handlers to `/api/v1`.

### Phase 4: Worker Separation

Status: not started. `WorkerRunnerService` still runs inside the `app` container.

Goal: allow background execution to move out of the web-serving process.

Deliverables:

- `agent-worker` process or container using existing `WorkerRunnerService`.
- Healthcheck and logs separated from the web app.
- Clear ownership of polling intervals, concurrency, and stale-run recovery.

Exit criteria:

- The web app can serve requests while the worker process handles agent runs.
- Restarting the web app does not interrupt active workers if the worker remains up.

### Phase 5: Headless Mode

Status: not started.

Goal: run Allerac without the web UI as a first-class deployment profile.

Deliverables:

- Documented compose profile or runtime mode.
- Control API, worker, DB, and required specialized services run without browser UI.
- CLI or API examples for setup, ticket creation, chat, and agent run polling.

Exit criteria:

- A user can operate core Allerac workflows with API keys and no browser.

## First Milestone

Status: complete.

Create a small, real vertical slice:

1. Add scoped API key authentication.
2. Add `GET /api/v1/domains`.
3. Add `GET/POST/PATCH /api/v1/tickets`.
4. Add tests proving API key scopes and user ownership.

This is enough to validate the direction without touching chat streaming, workers, or
the existing UI.

## Open Questions

- Should API keys be managed only by the web UI initially, or also by CLI?
- Should `/api/v1/messages` support streaming immediately, or start with polling?
- Should tool execution be exposed early, or only through chat and agents at first?
- How much of the existing `/api/*` surface should be considered legacy once `/api/v1`
  exists?
- Should service-to-service internal calls use the same API keys or separate internal
  service tokens?
