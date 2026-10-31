# Federation P4: Unified Inbox (federated agent chat)

Roadmap: [Federation Protocol](federation-protocol.md) (P4), [Allerac Federation](../architecture/allerac-federation.md).
Base: `development` (P0–P3 + unit identity #96/#98). Latest migration `145_unit_profile.sql` → P4 adds **146+**.
Scope: PR slices P4a/b/c (+ P4d Control Tower).

**Status:** P4a implemented (branch `feat/unified-inbox-p4a`). Decisions below were approved by Gianclaudio. Telegram routing is optional and comes later (not in this plan).

## Current State

- **Local chat:** tables `chat_conversations` (has `domain_slug`, from mig 038) and `chat_messages` (has `agent_run_id`, from mig 028);
  `src/app/services/database/chat.service.ts`. Execution happens in `src/app/services/chat/chat-execution.service.ts`.
- **UI:** `src/app/components/layout/ConversationSidebar.tsx`, `SidebarDesktop/Mobile.tsx`, `DomainChatPanel.tsx`,
  `components/chat/{ChatMessages,ChatInput,ChatHeader}.tsx`, `components/agents/useAgentRun.ts`.
- **Control API:** `/api/v1/conversations[/:id/messages]`, `/api/v1/agent-runs`,
  `/api/v1/federation/agents` (list, includes unit role) and `/api/v1/federation/agents/:agent/ask`
  (stateless `{question}` → `{answer, truncated}`; scope `federation:agents:ask`; rate limited; `maxDuration 60`).
- **Federation client:** `src/federation/federation-client.ts` (`listAgentsWithUnit`, `askAgent`; LIST 8s / ASK 60s timeouts; audit via mig 144).
  Peers are stored in `federation_peers` (mig 143). Unit identity is stored in `unit_profile` (mig 145).
- **Gap:** asks are stateless, so the remote side has no conversation continuity and there is no local record of remote chats.

## UX

- **Sidebar "Agents":** grouped by unit, with the home unit first, then each active peer. Group header: unit emoji + name + role
  (from `unit_profile` and the peer's agents response). Each row shows the agent (domain) name, last message preview, time, unread badge, and a status dot
  (green = peer reachable at last check, grey = offline/unknown, amber = degraded/slow).
- **Thread view:** reuses `ChatMessages` and `ChatInput`. The header shows "agent @ unit" and a "remote" chip. While a reply is pending, the thread shows a
  "thinking…" bubble. Failed sends show a retry button.
- Local agents open the existing domain chat. Remote agents open a federated thread. Each agent has one thread by default, plus a "new thread" action.
- Unpairing a peer hides its group immediately. Local history is kept read-only under "Archived units" (see decision 2).

## Data Model (home side, local mirror only)

Nothing is written to a peer's DB. The peer stores its own side.

Migration `146_federated_threads.sql` (as implemented; also adds a unique `(user_id, peer_id, agent_slug)` index for the
P4a default thread, `federation_audit_log.thread_id`, and the peer-side `chat_conversations.source` tag, see decision 1):
```sql
CREATE TABLE federated_threads (
  id uuid PK, user_id uuid NOT NULL REFERENCES users,
  peer_id uuid NOT NULL REFERENCES federation_peers ON DELETE CASCADE,  -- see decision 2
  agent_slug text NOT NULL,
  remote_conversation_id text,          -- P4b: continuity handle returned by peer
  title text, last_message_at timestamptz, last_read_at timestamptz,
  archived_at timestamptz, created_at timestamptz DEFAULT now());
CREATE INDEX ON federated_threads(user_id, last_message_at DESC);
CREATE TABLE federated_messages (
  id uuid PK, thread_id uuid REFERENCES federated_threads ON DELETE CASCADE,
  role text CHECK (role IN ('user','agent','system')),
  content text NOT NULL, status text CHECK (status IN ('pending','done','failed','timeout')),
  remote_message_id text, remote_run_id text, truncated bool DEFAULT false,
  error_code text, created_at timestamptz DEFAULT now());
```
Unread = count of agent messages where `created_at > last_read_at`. Remote threads are kept in separate tables rather than
`chat_conversations`, so the local LLM, memory and RAG pipelines never pick up remote text by accident.

## Protocol

| Need | Endpoint (on peer) | Status |
|---|---|---|
| List agents + unit role | `GET /api/v1/federation/agents` | reuse |
| One-shot ask | `POST /api/v1/federation/agents/:agent/ask` | reuse (P4a) |
| Conversation ask | same endpoint + optional `conversation_id` in the body; response returns `conversation_id`, `message_id` | **extend** (P4b, backward compatible) |
| Long answers | `?async=1` → `202 {run_id}`; `GET /api/v1/federation/runs/:id` to poll | **new** (P4c, a subset of the P5 run model) |
| Health/online | `GET /api/v1/health` (already exists) | reuse |

- **Continuity:** the peer stores the federated conversation in its own `chat_conversations`, owned by the acting user and
  tagged `source='federation'` plus `principal_id`. A `conversation_id` is accepted only if it belongs to the same principal, otherwise `404`.
- **Responses:** no cross-unit streaming in P4 (it is fragile over home links). The home UI gets live updates from the *local*
  server through SSE or polling, while the home server waits on the peer (sync up to 60s; P4c switches to async + polling every 3s, up to 10 min).
  Signed webhooks stay in P5.
- **Scopes:** reuse `federation:agents:list` and `federation:agents:ask`. Add `federation:runs:read` only in P4c.

## Security

- All peer calls go through `FederationClient` only (add `askAgentInConversation`, `getRun`). The existing lint/test
  guard that forbids `fetch` to peers elsewhere is extended to the new code.
- Inbox routes are server actions or `/api/inbox/*`, **session-auth and admin-only**. Federation is a unit-admin feature, and non-admins see only
  local agents. They are not exposed on the public domain or `/api/v1`.
- Pairing keys never reach the browser. The UI sees only `peer_id`, unit name, emoji and role.
- The peer keeps enforcing `is_admin:false` tool policy, exposed-agents allowlist, and rate limits. The home side also limits
  sends per thread (1 in flight) and per peer (e.g. 10/min), and caps input at `MAX_QUESTION_CHARS`.
- Remote answers are rendered as untrusted markdown (sanitized, no HTML, links rel=noopener) and are never fed to local tools automatically.
- Every send/receive is written to the audit log (`federation_audit_log`) with the thread id.

## Failure Modes

- **Peer offline or refused:** the message goes to `failed`, the UI shows retry, and the status dot turns grey. No automatic retries beyond 1 for idempotent GETs.
- **Timeout (60s, e.g. napols freezing):** the message goes to `timeout`. In P4c the send is async, so a slow peer shows the message as pending and polling
  continues with backoff. After 10 min it is marked `timeout`.
- **Duplicate on retry:** send an `Idempotency-Key` (local message id). The peer dedupes for 24h (P4b).
- **Peer revoked/unpaired:** threads are archived (read-only). Sends are blocked with "unit no longer paired".
- **Remote conversation lost (404):** start a new remote conversation and add a system note "context reset on <unit>".
- **Agent no longer exposed:** the row is greyed out and sending is disabled.
- **Status probe:** checks peer health when the sidebar opens, with a 30s cache and a 3s timeout, so it never blocks the list.

## Control Tower (P4d, can run in parallel after P4a)

An admin-only dashboard (`/admin/control-tower`, session-auth, never on a public domain) that gives one view of every unit and agent.

- **Units panel:** each unit (home + peers) shows emoji, role, online/degraded/offline, last heartbeat, latency, and version.
  A home-side heartbeat job calls each peer's status endpoint every 60s (3s timeout) and stores the result in `federation_peer_heartbeats`
  (or `last_seen_at` / `last_status` on `federation_peers`). Three missed beats mark the unit offline and raise an alert, which catches cases like napols freezing.
- **Activity panel:** running, queued and failed `agent_runs` plus federated asks across units. Each entry shows caller unit → target unit/agent,
  status, start time, duration, model, and tokens/cost when available. Filters: by unit, status, and last 1h/24h.
- **Events panel:** recent `federation_audit_log` events: denials, rate-limit blocks (429), scope errors, pairing/revoke, and timeouts.
- **Quick links:** each federated ask links to its inbox thread (`federated_messages.remote_run_id` / `thread_id`).
- **Shared data with the inbox:** the Control Tower and the inbox use the same `federated_threads`/`federated_messages` (home-side outbound asks),
  the same heartbeat (which drives the inbox status dots, so P4c reuses it), and the same `agent_runs`. No duplicate stores.

**Peer exposure (new):** `GET /api/v1/federation/status`, scope **`federation:status:read`** (read-only; `federation:runs:read`
stays for fetching one's own run results in P4c). It returns:
```json
{ "unit": {"name","emoji","role","version"}, "heartbeat_at": "...", "load": {"runs_running":2,"runs_queued":1},
  "runs": [{"id","agent","status","started_at","duration_ms","model","tokens_in","tokens_out","cost_usd","requested_by":"unit|local"}],
  "federation_events": [{"at","peer","action","outcome","http_status","error_code"}] }
```
- **Privacy:** metadata only by default. The endpoint returns no prompts, answers, tool arguments, user emails or names (local requesters show as `local`).
  Results are limited to the last 24h and 100 rows. The scope is granted per pairing and is opt-in on the peer
  (`ALLERAC_FEDERATION_STATUS=on`). The peer may hide model and cost. Responses go through the FederationClient and are audited.
- **Migration 149:** `federation_peer_heartbeats(peer_id, at, ok, latency_ms, version, error_code)`, pruned after 7 days,
  plus a `federation_principal_id` column on `agent_runs` if it is not already added.
- **Tests:** the status endpoint rejects a missing scope, the payload contains no content fields (snapshot test), heartbeat state transitions
  online→degraded→offline, and the dashboard is denied to non-admins.

## Phased Slices

- **P4a — List + 1:1 thread (minimal):** mig 146, unified sidebar (local + `listAgentsWithUnit` per peer, run in parallel, cached),
  federated thread view, send through the existing stateless `askAgent` with the last N=6 turns packed into the question (client-side
  context), local mirror rows, sync wait, error states. Acceptance: Gianclaudio chats with `santos/chat` from napols.
- **P4b — History/continuity:** peer-side `conversation_id` on ask (and a `federation_principal_id` column on the peer's
  `chat_conversations`, mig 147; `source` already landed in 146), idempotency keys, multiple threads per agent, archive on unpair, pagination.
- **P4c — Unread/realtime:** `last_read_at` badges, online dots, async ask + run polling (`federation:runs:read`),
  live updates through local SSE, optional browser/Telegram notification when a reply lands.
- **P4d — Control Tower:** heartbeat job, peer `GET /federation/status` + `federation:status:read`, admin dashboard
  (units, runs/asks, events, links into threads), offline alerts. Can start right after P4a, in parallel with P4b/c.

## Migrations

Numbering fixed (P4c and P4d previously both claimed 148):

- `146_federated_threads.sql` (P4a, implemented): the two tables above, `federation_audit_log.thread_id`, and
  `chat_conversations.source` (`'local'` | `'federation'`, backfilled from `Federation · %` titles). `source` moved here from 147
  so decision 1 holds from P4a.
- `147_federation_conversations.sql` (P4b, peer side): `chat_conversations.federation_principal_id uuid` and an
  idempotency table `federation_ask_dedupe(principal_id, key, response, created_at)`.
- `148_*` (P4c): only if needed, `agent_runs.federation_principal_id`. No schema change if runs reuse `agent_runs` as-is.
- `149_federation_peer_heartbeats.sql` (P4d): heartbeats (see Control Tower).

## Tests

- Unit: FederationClient new methods (timeouts, scope errors, 429 passthrough), unread count, context packing, idempotency.
- Route: inbox routes reject non-admins. Ask with a foreign `conversation_id` → 404. Async run polling.
- Guard: no direct peer `fetch` outside `src/federation/`. No pairing key in any client bundle or response.
- Integration (two local units in docker): pair → list → chat → kill peer → timeout state → restart → retry ok → unpair → archived.
- UI component tests: grouped sidebar, badges, pending/failed bubbles.

## Decisions (approved)

1. **Remote memory:** approved as recommended. P4a tags the peer's federated conversations `source='federation'` and the memory
   summarizer skips them (no memory extraction, no instruction distillation; federated tool policy already blocks memory tools).
   Full remote continuity landed in P4b.
2. **On unpair:** approved: read-only "Archived units" with a manual "Delete history" button.
3. **Live responses:** approved: synchronous in P4a (up to 60s), async + polling in P4c.

Original wording:

1. **Remote memory:** should the peer store the federated conversation in its own history and memory (so it can learn), or keep it
   ephemeral? **Recommended:** store it in the peer's history, tagged `source=federation`, but **exclude it from long-term memory extraction** by default.
2. **On unpair:** delete local threads or keep them read-only? **Recommended:** archive them read-only, with a manual "delete history" option.
3. **Live responses:** keep sync ask (60s cap) until P4c, or go async in P4a? **Recommended:** sync in P4a (simplest, uses the
   existing endpoint), then switch to async + polling in P4c because of slow units like napols.

## P4a Implementation Notes

- Code: `src/federation/inbox.{types,repository,service,instance}.ts`, `src/federation/inbox-policy.ts`,
  routes `src/app/api/inbox/*`, UI `src/app/components/inbox/*` (mounted in `ConversationSidebar`).
- Routes are `/api/inbox/*` with session auth + `requireCurrentAdmin`, and refuse `?domain=sales|openworld`.
- Home-side limits: 1 send in flight per thread, 10 sends/min per peer (in-process), input capped at `MAX_QUESTION_CHARS`
  including packed context (oldest turns dropped first).
- Timeout detection: `PeerClient` reports aborts as `peer_unreachable`; the service marks `timeout` when the call took
  ≥ 59s, otherwise `failed` with the federation error code.
- Agent lists are cached 30s per (user, peer); a failed listing shows the unit as offline (grey dot) with agents known
  from history greyed out. Health probes and amber/degraded state are left to P4c/P4d.
- Remote replies render as plain text (no markdown) in P4a; sanitized markdown can come later.
- Each send logs `[Inbox] send thread=… peer=… agent=… status=… ms=…` (no content) and the outbound audit row carries `thread_id`.
- Not in P4a: multiple threads per agent ("new thread"), pagination beyond the latest 200 messages, idempotency keys.

## P4b Implementation Notes

Decisions: (1) a P4a thread's first P4b send starts a **new** remote conversation and sends the packed last 6 turns once;
(2) the peer-side conversation title is `Federation · <unit> · <thread title>`; (3) deleting a thread deletes only the home
copy (remote delete deferred to P5).

- **Migration 147** (`147_federation_conversations.sql`): `chat_conversations.federation_principal_id`,
  `federation_ask_dedupe(principal_id, idempotency_key, request_hash, status, response, created_at, updated_at)`,
  `federated_threads.is_default` with a partial unique index (one default thread per user/peer/agent, any number of extra
  threads), a keyset index on `federated_messages(thread_id, created_at DESC, id DESC)`, and removal of memory index rows
  derived from federated conversations.
- **Peer:** `AgentsService.ask` accepts `conversationId` (undefined = legacy, null = new, uuid = continue, ownership-checked),
  `threadTitle` and `idempotencyKey`; dedupe lives in `src/federation/ask-dedupe{,.repository}.ts` (24h TTL, stale
  `in_progress` takeover after 2 min with compare-and-swap on `updated_at`).
- **Home:** `FederationClient.askAgentInConversation` (sends `Idempotency-Key`). `InboxService` sends only the new message
  when the thread has a `remote_conversation_id`, otherwise packs the last turns (first P4b send, or a pre-P4b peer that returns
  no id). A `conversation_not_found` from the peer clears the handle, adds a system note "Context reset on <unit>" and retries
  once with a new conversation. The idempotency key is `<local message id>:<remote conversation id | new>`.
- **Routes:** `POST /api/inbox/threads` accepts `new: true` and `title`; `GET /api/inbox/threads/:id/messages?before=&limit=`
  (thread view returns the latest 50 plus `nextCursor`); `PATCH /api/inbox/threads/:id` (rename); `DELETE /api/inbox/threads/:id`
  (only for unpaired units).
- **UI:** "+" per remote agent creates a thread; extra threads are listed under the agent; archived threads have a delete
  button; the thread panel has "Load older messages", rename, and renders system notes.
- **Memory/RAG:** memory recall, memory indexing (including the stale sweep) and knowledge search exclude summaries whose
  conversation is `source='federation'` (`src/app/services/memory/federated-memory-filter.ts`), on top of the creation-time
  filter from P4a.
