# Agent Runs

Agent run endpoints expose Allerac background execution through the Control API.
They create durable pending runs, then clients poll for status and results.

Required scopes:

| Endpoint | Scope |
|---|---|
| `GET /api/v1/agent-runs` | `agents:read` |
| `GET /api/v1/agent-runs/:id` | `agents:read` |
| `POST /api/v1/agent-runs` | `agents:write` |
| `POST /api/v1/agent-runs/:id/cancel` | `agents:write` |

Browser sessions can call these endpoints without API key scopes.

## `GET /api/v1/agent-runs`

Lists agent runs owned by the authenticated user.

Query params:

| Name | Type | Notes |
|---|---|---|
| `limit` | integer | Optional, `1` to `100`, defaults to `50` |

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/agent-runs?limit=10"
```

Response:

```json
{
  "data": {
    "agentRuns": [
      {
        "id": "run-id",
        "conversationId": "conversation-id",
        "userId": "user-id",
        "status": "pending",
        "prompt": "Investigate failing deploy",
        "plan": null,
        "result": null,
        "error": null,
        "model": "claude-haiku-4-5-20251001",
        "provider": "anthropic",
        "skillId": null,
        "lastHeartbeat": null,
        "startedAt": "2026-06-24T00:00:00.000Z",
        "completedAt": null,
        "cancelledAt": null,
        "workers": []
      }
    ]
  }
}
```

## `POST /api/v1/agent-runs`

Creates a pending agent run. The background worker picks it up asynchronously.

Request:

```json
{
  "message": "Investigate failing deploy",
  "conversationId": null,
  "model": "claude-haiku-4-5-20251001",
  "provider": "anthropic",
  "skillName": "tickets"
}
```

Fields:

| Name | Required | Notes |
|---|---:|---|
| `message` | yes | Prompt for the run |
| `conversationId` | no | Existing conversation owned by the user; omit or `null` to create one |
| `model` | no | Defaults to `qwen2.5:3b` |
| `provider` | no | Defaults to `ollama` |
| `skillName` | no | Optional skill name to bind to the run |

Example:

```bash
curl -s \
  -X POST \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message":"Investigate failing deploy","provider":"anthropic","model":"claude-haiku-4-5-20251001"}' \
  http://localhost:8080/api/v1/agent-runs
```

Response:

```json
{
  "data": {
    "agentRun": {
      "id": "run-id",
      "conversationId": "conversation-id",
      "status": "pending"
    }
  }
}
```

## `GET /api/v1/agent-runs/:id`

Returns one owned agent run with worker status.

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/agent-runs/$RUN_ID
```

Terminal states are `completed`, `failed`, and `cancelled`.

## `POST /api/v1/agent-runs/:id/cancel`

Cancels an owned pending or active run.

Example:

```bash
curl -s \
  -X POST \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/agent-runs/$RUN_ID/cancel
```

Response:

```json
{
  "data": {
    "cancelled": true
  }
}
```

## Polling Contract

Clients should create a run, then poll `GET /api/v1/agent-runs/:id` until the run
reaches a terminal state. Streaming is intentionally deferred.
