# Federation Agents

Paired Units (see [Federation Pairing](federation-pairing.md)) can list and ask
each other's agents. This is roadmap step P3.

An **agent** is a chat domain (for example `health` or `music`) that a Unit
explicitly exposes. Nothing is exposed by default.

## Exposing agents

Set `ALLERAC_FEDERATION_AGENTS` to a comma list of domain slugs:

```env
ALLERAC_FEDERATION_AGENTS=health,music
```

A domain is listed to a peer only when it is:

- in `ALLERAC_FEDERATION_AGENTS`;
- enabled (module selection, `ALLERAC_MODULES` / `ALLERAC_PROFILE`) and active in the `domains` table;
- accessible to the peer's acting user (the local user the peer principal acts as);
- not a public domain (`alleracweb`, `openworld`). Public domains are never exposed.

The peer also needs the matching capability, granted at pairing time:
`federation.agents.list` (scope `federation:agents:list`) and
`federation.agents.ask` (scope `federation:agents:ask`).

## How a question is answered

`POST /api/v1/federation/agents/:agent/ask` runs a normal chat turn in that
domain as the acting user, in a conversation titled `Federation · <peer>`
(reused across calls). Since migration 146 that conversation is tagged
`chat_conversations.source = 'federation'`: it stays in the chat history but is
excluded from long-term memory extraction (conversation summaries and the
instructions distilled from them). The `federated` tool policy already blocks
memory, instruction, and schedule tools. The receiving Unit picks the model server-side, because
the chat selector's choice lives in the browser and is not available here:

1. the acting user's model for that domain (Settings > Domains, saved with
   "inherit global" off);
2. the acting user's saved global model (`user_settings.selected_model`), if
   its provider has a key;
3. a Unit default from the configured provider keys (user, system settings, or
   env), in order: Anthropic (`claude-sonnet-4-6`), OpenAI, Gemini, GitHub
   Models, then Ollama when `OLLAMA_BASE_URL` is set.

The acting user is the admin who accepted the pairing on the receiving Unit.

Federated requests use a restricted tool policy:

- no shell, GitHub, logs, or federation tools;
- no tools that change durable state on this Unit (`create_memory`,
  `delete_memory`, `learn_instruction`, `schedule_task`);
- admin-only features are off, even when the acting user is an admin.

Limits: question up to 4,000 characters; answers longer than 8,000 characters
are truncated (`truncated: true`); server-side timeout of 55 seconds.

## Inbound endpoints (Unit to Unit)

Both require the peer's service key (`Authorization: Bearer <key>`) and an
active pairing. Personal API keys and browser sessions get `403`.

| Endpoint | Scope | Response |
|---|---|---|
| `GET /api/v1/federation/agents` | `federation:agents:list` | `{ "data": { "agents": [{ "id", "name", "description" }], "unit": { "name", "displayName", "emoji", "role", "description", "tags" } } }` (`unit` since P3.5; may be absent on older Units) |
| `POST /api/v1/federation/agents/:agent/ask` | `federation:agents:ask` | `{ "data": { "answer", "truncated", "conversation_id", "message_id" } }` |

Request body for ask: `{ "question": "...", "conversation_id"?: "<uuid>" | null, "thread_title"?: "..." }`.

Conversation continuity (P4b, backward compatible):

- `conversation_id` omitted: legacy behaviour, one shared `Federation · <unit>` conversation; the response has `conversation_id: null`.
- `conversation_id: null`: a new conversation is created, titled `Federation · <unit> · <thread_title>`, owned by the calling
  principal (`chat_conversations.federation_principal_id`) and tagged `source='federation'` (kept in history, never in memory or RAG).
- `conversation_id: "<uuid>"`: the agent continues that conversation. It must belong to the same principal, acting user and
  agent, otherwise `404 conversation_not_found`.
- Optional `Idempotency-Key` header (`[A-Za-z0-9_:.-]{1,100}`): a repeat with the same body replays the stored reply for 24h
  without running the agent. Same key with a different body → `422 idempotency_key_reused`; while the first request is still
  running → `409 ask_in_progress`. A request stuck in progress expires after 2 minutes.

Errors: `400` invalid question, `401` missing or invalid key, `403` not a
paired Unit or scope missing, `404` agent not exposed, `422` no model
provider configured on the receiving Unit, `429` rate limited (with `Retry-After`), `504` timeout.

## Chat tools (outbound)

Admins chatting on a Unit with at least one active peer get two tools:

- `list_peer_agents({ peer? })`: lists agents on paired Units.
- `ask_peer_agent({ peer, agent, question })`: asks one agent and returns its answer.

The tools are never offered in public domains, in domains without tools, or to
non-admin users, and the tool runner re-checks this on every call. All
outbound calls go through the shared federation client
(`src/federation/federation-client.ts`), which only calls active peers, only
uses capabilities the peer granted, and uses the stored pairing key.

## Audit log

Every inbound and outbound federation call is written to
`federation_audit_log` (migration 144): direction, peer, principal, user,
capability, target agent, outcome, HTTP status, error code, duration and sizes.
Question and answer content is never stored.

Admins can read recent entries for one peer with
`GET /api/v1/peers/:id/audit?limit=50` (browser session, max 200).

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ALLERAC_FEDERATION_AGENTS` | (empty) | Domain slugs exposed to paired Units |
| `RATE_LIMIT_FEDERATION_ASK_REQUESTS` / `RATE_LIMIT_FEDERATION_ASK_WINDOW_SECONDS` | `20` / `600` | Ask limit per peer principal |
| `CONCURRENCY_LIMIT_FEDERATION_ASK` | `1` | Concurrent asks per peer principal |

Asks also count against the acting user's normal `chat` limit.

## Not in this step

- Request signing (planned with P5).
- `delegate_to_peer` and agent runs on peers (P5).
- Audit log retention cleanup.

## Unit identity and role (P3.5)

Admins edit this Unit's role in Settings > Discovery > This Unit
(`GET/PUT /api/v1/unit/profile`, session admin). Paired Units receive it in the
`unit` field of the agents list; agent `description` comes from the per-agent
text. `GET /api/v1/peers/:id/profile` (session admin) fetches a peer's role live.

## Unified inbox (home side, P4a)

Admins chat with remote agents from the sidebar "Agents" section; see
[Unified Inbox](../roadmap/federation-unified-inbox.md). The browser only talks to
the home Unit's session-authenticated, admin-only `/api/inbox/*` routes:

| Route | Purpose |
|---|---|
| `GET /api/inbox/agents` | Local agents plus each active peer's exposed agents (grouped by Unit) and archived (unpaired) Units |
| `POST /api/inbox/threads` `{peerId, agent}` | Open (or return) the 1:1 thread with a remote agent |
| `GET /api/inbox/threads/:id` | Thread messages; marks the thread read |
| `POST /api/inbox/threads/:id/messages` `{content}` | Send and wait for the reply (sync, up to 60s) |
| `POST /api/inbox/threads/:id/messages/:messageId/retry` | Retry a `failed` or `timeout` message |
| `DELETE /api/inbox/peers/:peerId/history` | Delete local history with a Unit that is no longer paired |

All routes accept `?domain=<slug>` and refuse public domains (`alleracweb`, `openworld`).
The home Unit calls the peer's existing `ask` endpoint through `FederationClient`,
packing the last 6 turns into the question. Pairing keys and peer origins never
reach the browser.

## Async asks and late replies (P4c)

Peers on this version advertise `protocol: { ask: 2 }` in `GET /api/v1/federation/agents`.
Homes only use async asks with such peers; with older peers the inbox stays synchronous (60s).

- `POST /api/v1/federation/agents/:agent/ask?async=1` (requires `Idempotency-Key`) returns
  `202 { status: "pending", key, poll_after_ms }` and runs the agent in the background for up to
  10 minutes, or `200 { status: "done", ... }` when the result is already known (replay).
  Background runs are capped per Unit (`FEDERATION_ASYNC_MAX_RUNNING`, default 4).
- `GET /api/v1/federation/asks/:key` (scope `federation:agents:ask`, no re-pairing) returns
  `200` done with the answer, `202` while pending, `{ status: "failed", error_code }` when it failed,
  and `404 ask_not_found` when the peer no longer has it. The dedupe table is the result store.
- The home polls pending replies with backoff (3s, 3s, 5s, 10s, 15s, then 30s, ±20% jitter): from the
  browser through `GET /api/inbox/updates` and the open thread, and from a background sweep every
  15s (`INBOX_POLL_SWEEP_EVERY_MS`, disable with `INBOX_POLL_SWEEP_ENABLED=false`; it needs background
  workers enabled). After 11 minutes a pending message reads as `timeout`.
- Late replies stay unread until the thread is opened (`POST /api/inbox/threads/:id/read`).
- `ask_peer_agent` now keeps one remote conversation per local chat, peer and agent
  (`federated_tool_conversations`), with idempotency key `tool:<uuid>`. It stays synchronous.

## Control Tower (P4d)

An admin-only page, `/admin/control-tower` (linked from Admin), shows every paired unit and what its agents are doing.
It shows **metadata only**: never prompts, answers, plans, titles or users.

### Peer side: `GET /api/v1/federation/status`

- **Access.** The caller needs the scope `federation:status:read` (capability `federation.status.read`), and the endpoint is opt-in.
  With `ALLERAC_FEDERATION_STATUS=on` unset, the capability is not advertised, cannot be granted, and the endpoint returns 404 `status_disabled`.
- **Payload.** A strict, versioned allow-list (`src/federation/status.schema.ts`):
  - unit identity and version;
  - load (runs running/queued, async asks);
  - per-agent ask counts;
  - recent runs (opaque id, status, timing, tokens);
  - federated asks and failure events.
- **Limits and redaction.**
  - Last 24h only (`?since=` is clamped) and at most 100 rows per list.
  - Inbound ask targets are named only if the agent is exposed.
  - `ALLERAC_FEDERATION_STATUS_HIDE=tokens` hides token counts.
- **Grants feedback.** The response, like the agents list, carries `granted_capabilities` (what the calling key holds).

### Granting on an existing pairing

In Settings → Discovery, each paired unit has a "Grant status read" button (and "Revoke status read" once granted).

- It adds the scope to the pairing's existing federation key in place, so there is no new key and no re-pairing.
- It is admin-only and audited as `federation.grants.update`.
- It only touches service-principal keys of an active peer and always keeps the revoke scope.
- The home picks up the change from `granted_capabilities` on its next heartbeat.
- The API behind the button is `POST /api/v1/peers/:id/grants` with `{ add?: [...], remove?: [...] }`.

### Home side: heartbeat

- **Schedule.** The heartbeat runs every 60s (`CONTROL_TOWER_HEARTBEAT_MS`, minimum 15s; disable with `CONTROL_TOWER_HEARTBEAT_ENABLED=false`).
  It needs background workers enabled and holds an advisory lock while it runs.
- **Probe.** Each active peer gets a 3s probe, using the richest call the peer granted:
  1. status;
  2. otherwise the agents list;
  3. otherwise the public manifest.
- **States.**
  - Only "unreachable" counts as a miss: one or two misses are `degraded`, three are `offline`, which raises an in-page banner.
  - A beat slower than 1.5s is `degraded`.
  - A peer without the status grant shows as `limited`.
- **Storage (migration 149).**
  - Beats go to `federation_peer_heartbeats` and are pruned after 7 days.
  - The latest validated snapshot is stored on `federation_peers` and overwritten on each beat; there is no history of remote activity.
  - Successful status/probe reads are not audited, to keep the log readable. Failures are.
- **Page.**
  - Reads only from the database and refreshes every 15s while visible.
  - "Refresh now" (`POST /api/admin/control-tower/refresh`) is throttled to once per 10s per peer.
  - `GET /api/admin/control-tower?window=1h|24h&status=all|running|failed&unit=` serves the page data. It is session-admin only and returns 404 to non-admins and on public domains.
