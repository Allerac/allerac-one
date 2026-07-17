# Control API v1 Gap Audit - 2026-06-29

## Summary

The current OpenAPI contract and implementation are in sync:

- 41 `/api/v1` route paths.
- 57 implemented `/api/v1` operations.
- No OpenAPI operation is missing a route handler.
- No implemented `/api/v1` route is missing from OpenAPI.

The remaining work is not a simple OpenAPI/code mismatch. It is deciding which
legacy `/api/*` surfaces should become stable Control API contracts, which should
remain browser/internal routes, and which are OAuth/webhook callbacks that should
stay outside `/api/v1`.

## Implemented Control API Surface

Implemented and documented in `docs/api/openapi/control-api-v1.yaml`:

- System: `GET /api/v1/me`, `GET /api/v1/domains`, `GET /api/v1/capabilities`
- API keys: list, create, revoke
- Conversations: list, create, list messages, send message
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
- Finance: quotes, symbol search, candles, watchlist list, add, remove

## Clear Pending API Contracts

These are explicitly implied by the Control API architecture or current product
shape, but do not yet exist as `/api/v1` contracts.

| Area | Pending contract | Current backing route/service | Notes |
|---|---|---|---|
| Tool execution | `POST /api/v1/tools/:name/run` | Chat tool registry, scattered API routes | Mentioned in architecture. Should likely wait until tool permission model is explicit. |
| Chat attachment extraction | Possibly folded into message send | `POST /api/chat/extract-text` | Should probably not be a standalone public contract unless clients need pre-processing. |

## Started Since This Audit

- `POST /api/v1/conversations/:id/messages` now exists as a synchronous,
  non-streaming chat execution contract. It persists the user message, runs the
  same server-side chat pipeline, persists the assistant response, and returns the
  final assistant message plus aggregated execution events.
- `GET /api/v1/capabilities` now exists as a safe capability map for the current
  user. It reports configured/connected/available states without returning secrets.
- `POST /api/v1/jobs/:id/run` now exists for manual execution of enabled scheduled
  jobs. It returns a `job_executions` record and can be smoke-tested from Bruno.
- `GET /api/v1/finance/quote` and `GET /api/v1/finance/candles` now expose
  read-only market data through the Control API.
- `GET /api/v1/search` now exposes Tavily-backed web search with the standard v1
  response envelope.
- `GET /api/v1/email/messages`, `GET /api/v1/email/message`, and
  `POST /api/v1/email/send` now expose owned IMAP/SMTP accounts through v1.

## Legacy Domain Routes Still Without v1 Equivalents

These are product-facing routes under `/api/*` that may need isolation if external
clients, CLI, Telegram, or future mobile clients should use them.

| Legacy route(s) | Candidate v1 resource | Priority | Notes |
|---|---|---:|---|
| `/api/health/metrics`, `/api/health/activities-range` | Extend `/api/v1/health/*` | Low/Medium | v1 has status, summary, daily, activities. Detailed metrics/range endpoints are not represented. |
| `/api/instagram/conversations`, `/api/instagram/publish`, `/api/instagram/send` | `/api/v1/social/*` or `/api/v1/instagram/*` | Medium | OAuth callbacks/webhooks should stay separate, but publish/send/conversation actions may need Control API contracts. |
| `/api/workspace/*` | `/api/v1/workspace/*` | Medium/High for Code domain | Large surface: file tree, file read/write, processes, run, kill, projects, delete. Needs stricter path/process security contract before public v1. |
| `/api/skill-eval`, `/api/skill-eval/apply`, `/api/skill-eval/improve` | `/api/v1/skills/:id/evaluations` or internal only | Low/Medium | Current v1 skills CRUD exists; evaluation/improvement workflow is still legacy. |
| `/api/benchmark`, `/api/benchmark/vision` | `/api/v1/benchmarks/*` or admin/internal only | Low | Likely admin/operator API rather than general control-plane API. |
| `/api/logs`, `/api/log-submit` | `/api/v1/logs` or internal telemetry | Low | Decide whether external clients should submit/read logs. |
| `/api/github/pr/:number` | Tool execution or `/api/v1/github/*` | Low | Likely better hidden behind tools unless GitHub becomes first-class. |
| `/api/space/tle` | `/api/v1/space/tle` | Low | Domain-specific read endpoint, currently outside v1. |
| `/api/ollama/api/chat`, `/api/ollama/pull` | `/api/v1/models/*` or internal only | Low/Medium | Public contract should probably be model management/status, not raw Ollama proxying. |

## Routes That Should Probably Stay Outside Control API

These are protocol callbacks or browser/OAuth integration surfaces rather than
stable user-facing Control API resources:

- `/api/auth/google`
- `/api/auth/google/callback`
- `/api/instagram/auth`
- `/api/instagram/callback`
- `/api/instagram/webhook`
- `/api/tiktok/auth`
- `/api/tiktok/callback`

They still need security review, but not necessarily `/api/v1` replacement.

## Documentation Gaps

- ~~`docs/roadmap/control-api-v1.md` is stale in places.~~ Resolved 2026-07-14: the
  roadmap status, snapshot, and next ticket were synced with the implemented surface.
- ~~`docs/architecture/control-api-v1.md` lists unimplemented target routes.~~
  Resolved 2026-07-14: `POST /api/v1/conversations/:id/messages` is implemented and
  the architecture doc now marks phase status. Only `POST /api/v1/tools/:name/run`
  remains unimplemented, by decision.
- ~~The initial scope list in the architecture doc does not include newer scopes.~~
  Resolved: the scope table now includes `documents:*`, `notes:*`, `jobs:*`,
  `skills:*`, `health:*`, `search:read`, `email:*`, and `finance:*`.

## Recommended Next Work

1. Update the roadmap to reflect the actual implemented v1 surface.
2. Decide whether a future streaming or async/polling chat contract is needed in
   addition to the synchronous `POST /api/v1/conversations/:id/messages` endpoint.
3. Decide whether `tools:run` is a standalone API or only reachable through chat and
   agent runs.
4. Pick one of the remaining high-judgment surfaces: workspace, social/Instagram,
   skill evaluation, or a constrained `tools:run` contract.
