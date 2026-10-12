# n8n Workflow Integration

**Status:** Complete (Phases 1–3) — validated both locally and in production
2026-08-01. Both trigger directions confirmed working: n8n → Allerac via `/run` +
scoped API key, and Allerac → n8n via the new `webhook` job channel. A real workflow
(daily news → Telegram) runs live on the sandbox VM. Phase 4 remains deliberately
deferred — see below.

**Depends on:** Control API v1 (`/api/v1/jobs`), the `scheduled_jobs` model, `apiKeyService`
scoped API keys

**Enables:** Multi-step automation and external-service integration (email, calendar,
storage, third-party webhooks) around Allerac, without building orchestration logic
inside the app itself

## Objective

Run [n8n](https://n8n.io) as a self-hosted workflow-automation tool alongside the
Allerac stack, and use it as the layer that handles multi-step logic, scheduling
variety, and third-party service integration that Allerac's own Jobs feature does not
attempt to solve. Jobs stays the simple, native way to run one prompt on a cron
schedule; n8n becomes an optional automation layer that can call into Allerac and, in
one direction, be called by Allerac.

This must stay consistent with the project's private-first principle: n8n runs
self-hosted, on the same Docker network as the rest of the stack, not as a
third-party cloud service.

## Current state (verified in code)

- `scheduled_jobs` (migration `007_scheduled_jobs.sql` onward) models a job as
  `cron_expr + prompt + channels`. `channels` is a `string[]` but every call site
  (`JobsPanel.tsx`, `ScheduledJobsModal.tsx`, `jobs.tool.ts`) hardcodes it to
  `['telegram']`. There is no generic outbound delivery target today.
- `POST /api/v1/jobs/:id/run` (`src/app/api/v1/jobs/[id]/run/route.ts`) already
  exists and already functions as an **inbound HTTP trigger**: it runs a job
  on-demand, independent of its `cron_expr`, authenticated via `requireApiUser('jobs:write', request)`.
- Auth (`src/app/api/v1/_lib/auth.ts`) supports two modes: browser session, or a
  Bearer token validated by `apiKeyService.validateBearerToken(token, scope)`. Keys
  carry scopes (e.g. `jobs:write`), so a key minted for n8n can be restricted to just
  what it needs.
- No agent tool exposes generic outbound HTTP (only `search-web`, `read-url`,
  `github`, `shell`). There is no way today for a job or agent run to call an
  arbitrary external webhook (e.g. an n8n Webhook Trigger) as part of its own
  execution.

**Conclusion:** the *n8n → Allerac* direction (n8n triggers an existing job) needs no
new Allerac code — it's a scoped API key plus an HTTP Request node. The
*Allerac → n8n* direction (a job's result kicks off an n8n flow) does not exist yet
and needs a new delivery channel.

## Target model

### Inbound: n8n triggers Allerac (works today)

n8n's cron node, or any upstream trigger it supports, calls
`POST /api/v1/jobs/:id/run` with `Authorization: Bearer <scoped key>`. This gives
Allerac jobs an HTTP trigger in addition to their own cron scheduler, the same way a
Lambda/Azure Function can be invoked by a scheduler or by API Gateway without the
function caring which one fired it.

### Outbound: Allerac triggers n8n (needs a new channel)

Add a `webhook` channel type to `scheduled_jobs` alongside `telegram`, carrying a
target URL (an n8n Webhook Trigger). On execution, the delivery step POSTs the job's
result to that URL instead of, or in addition to, Telegram. This makes a job's
completion the entry point for any downstream n8n flow — cross-service notification,
data transformation, conditional branching — without teaching Allerac about any of
that logic itself.

## Phased delivery

### Phase 1 — Local n8n container (done 2026-08-01, no Allerac app code changes)

1. Added an `n8n` service to `docker-compose.yml` under a new `automation` profile
   (`COMPOSE_PROFILES=automation`), matching the existing `local`/`cloud`/`webhook`
   profile pattern rather than a separate compose file.
2. Uses n8n's own SQLite store (`n8n_data` volume) instead of sharing the Allerac
   Postgres instance — simpler for a first working setup, no schema/migration
   coordination with `init.sql`. Sharing Postgres remains a possible future
   optimization, not a requirement (see open questions).
3. `n8n_data` named volume persists `/home/node/.n8n` (workflows, credentials).
4. `N8N_ENCRYPTION_KEY` added as a required secret in `.env.example`, generated the
   same way as `ENCRYPTION_KEY`.
5. No custom Docker network needed — compose already puts every service on one
   default network, so `n8n` is reachable from `app`/`agent-worker` at
   `http://n8n:5678`, and n8n can reach the app at `http://app:8080`.
6. Reachable at `http://localhost:5678` on the host once started with
   `COMPOSE_PROFILES=automation docker compose up -d n8n`.
7. Note: the initial `256M` memory limit (copied from lighter optional services like
   `portainer`) caused an out-of-memory crash loop during n8n's first-boot Postgres
   migrations. Raised to `1G`, matching the `app` service's headroom, and it started
   cleanly.

### Phase 2 — Validate the inbound direction (demo workflow built 2026-08-01)

1. Demo workflow authored as portable JSON at
   `infra/n8n/workflows/demo-trigger-allerac-job.json` (Manual Trigger → HTTP
   Request → `POST /api/v1/jobs/9c96efe7-3aaf-41fd-9e4b-ff3d1d433cd3/run`, the
   existing "Hour Reminder" job) and imported into the running instance with
   `n8n import:workflow`. See `infra/n8n/README.md` for the import steps.
2. Deliberately does not embed a secret: the HTTP Request node references an
   `httpHeaderAuth` credential by name (`Allerac API Key`) that does not exist until
   created locally. Still required, manually, once:
   - Create a dedicated API key for n8n in Allerac (Settings → Control API Access),
     preset **Automation** or at minimum scope `jobs:write` — not a personal session
     key.
   - Create a matching **Header Auth** credential in n8n
     (`Authorization: Bearer <key>`) and attach it to the HTTP Request node.
3. Confirmed 2026-08-01: manual execution from n8n produced
   `job_executions.id = d12acf00-b03d-49a6-aa98-36ef8859dedf`, `status = completed`,
   visible in the Allerac database and delivered via the job's `telegram` channel.
   Inbound direction (n8n → Allerac) is fully validated end to end.

### Phase 3 — Outbound `webhook` channel (built 2026-08-01)

1. Migration `104_scheduled_jobs_webhook_channel.sql` adds a nullable
   `webhook_url TEXT` column to `scheduled_jobs` — one URL per job, matching the
   "one URL is enough for now" resolution to the earlier open question.
2. Delivery logic lives in the Go `notifier` service, not
   `scheduled-jobs.service.ts` — see "Correction" below for why.
   `infra/notifier/internal/consumers/webhook/consumer.go` mirrors the existing
   Telegram consumer pattern exactly: same Redis Stream, consumer-group,
   retry/DLQ semantics. It looks up `webhook_url` by `job_id` at delivery time
   (like the Telegram consumer looks up `chat_id`/bot token by `user_id`) and
   POSTs `{ job_id, content, delivered_at }` as JSON. Registered in
   `cmd/notifier/main.go` alongside the Telegram consumer.
3. TS layer: `webhookUrl` threaded through `types.ts`, `scheduled-jobs.service.ts`,
   `actions/scheduled-jobs.ts`, and the Control API (`POST`/`PATCH /api/v1/jobs`,
   `jobDto`) with validation requiring a URL whenever `webhook` is in `channels`.
4. UI: `JobsPanel.tsx` and `ScheduledJobsModal.tsx` both gained `webhook` as a
   second channel checkbox with a conditional URL input, mirroring the existing
   `telegram`-only checkbox list. i18n keys added to all 4 locales (en/pt/es/ca).
5. Tests: Go (`consumer_test.go`, 7 cases covering delivery, missing URL, DB error,
   endpoint error, and DLQ behavior) and TypeScript (`control-api-jobs.test.ts`
   webhook validation/creation cases; existing `scheduled-jobs.service.test.ts`
   param-order assertion updated for the new column). Full `go test ./...` and the
   scoped Jest suites pass; `tsc --noEmit` shows no new errors.

**Correction to the original plan**: step 2 above originally said the delivery
edit belonged in `scheduled-jobs.service.ts`. That was wrong — tracing the
existing Telegram delivery path showed `runJobNow` (used by the manual
`/api/v1/jobs/:id/run` endpoint) only runs the prompt and writes to
`job_executions`; it never delivers to any channel, Telegram included. Channel
delivery (Telegram today, webhook now) only happens for **cron-triggered**
executions, via the separate Go `notifier` service's `Scheduler.ExecuteJob` →
`publisher.Publish` → Redis Stream → consumer. This is a pre-existing asymmetry,
not something introduced here: **manually running a job via the UI's "Run now" or
the Control API's `/run` endpoint does not deliver to Telegram or webhook** —
only its own cron schedule does. Worth fixing or documenting more visibly at the
product level; out of scope here.

**End-to-end validation (2026-08-01):** temporarily set the "n8n Workflow" job's
`channels` to `{webhook}` with `webhook_url = http://n8n:5678/webhook/allerac-job`
and a near-future one-off `cron_expr`, pointed at the imported
`demo-receive-allerac-webhook.json` workflow (published + n8n restarted so the
webhook route was live). Confirmed via `notifier` logs
(`[webhook-consumer] Delivering job 9c96efe7... to http://n8n:5678/webhook/allerac-job`),
`job_executions` (`status = completed`, result delivered in 13s), and the Redis DLQ
(`notifications:dead`) showing zero new `webhook`-channel entries — first-attempt
success, no retries. The job was reset to its original cron/prompt/channels
afterward; `webhook_url` stays saved on the row for reuse.

### Production deployment (sandbox VM, validated 2026-08-01)

Beyond the local Docker validation above, n8n was also deployed to the "sbx"
sandbox VM, behind the same Cloudflare Tunnel already used for the rest of the
Allerac stack, and used to run a real, non-demo workflow end to end.

1. n8n exposed at `napols-n8n.allerac.ai`. Originally attempted as a two-level
   subdomain (`napols.n8n.allerac.ai`), which failed with
   `SSL_ERROR_NO_CYPHER_OVERLAP` — Cloudflare's free Universal SSL only covers the
   apex domain plus one wildcard level, not multi-level subdomains. Renamed to a
   single-level subdomain to fix it.
2. Cloudflare Access (Zero Trust) gates the hostname with an Allow+email policy for
   the admin UI, plus a second Access Application scoped to
   `napols-n8n.allerac.ai/webhook/*` with a **Bypass** action — otherwise inbound
   webhook POSTs get redirected to the Access login page instead of reaching n8n.
3. `daily-news-telegram.json` (see `infra/n8n/README.md`) was imported, published,
   and activated on the VM instance: Webhook (`/webhook/daily-news`) → Telegram
   "Send Message". Paired with a real Allerac job (prompt: search and summarize
   today's news, `channels: ["webhook"]`, `webhookUrl` pointing at that route).
4. Confirmed live: the job's cron-triggered execution POSTed its result to the
   webhook, and the news summary was delivered to Telegram by n8n — the full
   Allerac → n8n → third-party-service path, in production, not just against the
   local demo receiver.

This is stronger evidence of completion than the local Phase 2–3 demos alone: it's
a real workflow, on the real deployment target, doing something a user actually
wants (daily news delivery) rather than proving connectivity in the abstract.

### Phase 4 — Deferred: unified trigger model

Only if Phase 2–3 prove useful in practice: formalize `trigger_type`
(`cron` | `webhook` | `manual`) on `scheduled_jobs` instead of treating the `/run`
endpoint as a side-channel trigger, and consider per-job signed URLs if a job ever
needs to accept a webhook call from something that isn't a trusted internal n8n
instance.

## Open questions

- If n8n usage grows, is it worth migrating from SQLite to the shared Postgres
  instance (separate schema) for backup/restore consistency with the rest of the
  platform, or is a separate `n8n_data` volume acceptable long-term?
- Resolved: the outbound `webhook` channel supports one URL per job
  (`webhook_url`), not an array. Revisit only if a real use case needs fan-out to
  multiple n8n workflows from a single job.
- Should n8n-issued API keys get a distinct label/rotation policy in the API keys UI
  so they're recognizable as machine-to-machine credentials?
- Is exposing `/api/v1/jobs/:id/run` to anything beyond a same-network n8n instance
  ever a requirement, or does that stay explicitly out of scope (see Deferred)?
- Should manually-triggered job runs (`/run` endpoint, "Run now" in the UI) start
  delivering to configured channels (Telegram, webhook) the same way cron-triggered
  runs do? Today they silently don't (see "Correction" under Phase 3).

## Definition of done (Phase 1–2 slice)

- n8n runs locally in Docker, on the Allerac network, with persistent storage.
- A scoped API key exists for machine-to-machine use, distinct from personal session
  auth.
- At least one working end-to-end demo: an n8n-triggered call successfully runs an
  existing Allerac job via the Control API and the execution is visible in the
  Allerac UI.

## Deferred and out of scope

- The outbound `webhook` channel (Phase 3) and any unified trigger model (Phase 4)
  until the inbound direction has been used in practice.
- Exposing any Allerac job endpoint as a public-facing webhook target.
- Building multi-step orchestration, branching, or third-party service logic inside
  Allerac itself — that responsibility stays in n8n by design.
- A generic outbound-HTTP agent tool; not required for either direction above.

## References

- Control API v1 roadmap: [`control-api-v1.md`](control-api-v1.md)
- `src/app/services/scheduled-jobs/scheduled-jobs.service.ts`
- `src/app/api/v1/jobs/[id]/run/route.ts`
- `src/app/api/v1/_lib/auth.ts`
