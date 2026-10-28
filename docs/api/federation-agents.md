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
- not a public domain (`sales`, `openworld`). Public domains are never exposed.

The peer also needs the matching capability, granted at pairing time:
`federation.agents.list` (scope `federation:agents:list`) and
`federation.agents.ask` (scope `federation:agents:ask`).

## How a question is answered

`POST /api/v1/federation/agents/:agent/ask` runs a normal chat turn in that
domain as the acting user, in a conversation titled `Federation · <peer>`
(reused across calls). The receiving Unit picks the model server-side, because
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
| `GET /api/v1/federation/agents` | `federation:agents:list` | `{ "data": { "agents": [{ "id", "name", "description" }] } }` |
| `POST /api/v1/federation/agents/:agent/ask` | `federation:agents:ask` | `{ "data": { "answer", "truncated" } }` |

Request body for ask: `{ "question": "..." }`.

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
