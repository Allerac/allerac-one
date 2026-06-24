# Tickets API

Tickets endpoints expose the current Tickets domain through the Control API.

## `GET /api/v1/tickets`

Lists tickets owned by the authenticated user.

Required scope:

```text
tickets:read
```

Query parameters:

| Name | Type | Notes |
|---|---|---|
| `status` | `open`, `in_progress`, `resolved`, `cancelled` | Optional |
| `type` | `task`, `bug`, `improvement`, `question` | Optional |
| `priorityLevel` | `low`, `medium`, `high`, `critical` | Optional |
| `limit` | integer, 1-100 | Optional |
| `offset` | integer, 0+ | Optional |

Example:

```bash
curl -s \
  -H "Cookie: session_token=$SESSION_TOKEN" \
  "http://localhost:8080/api/v1/tickets?status=open&limit=20"
```

Response:

```json
{
  "data": {
    "tickets": [
      {
        "id": "ticket-id",
        "number": 42,
        "title": "Fix caption generation",
        "description": "Caption endpoint fails on PNG uploads",
        "type": "bug",
        "status": "open",
        "priority": {
          "level": "high",
          "score": 65,
          "factors": {}
        },
        "createdBy": {
          "type": "user",
          "runId": null
        },
        "assignedTo": null,
        "resolvedBy": null,
        "resolutionNotes": null,
        "tags": ["api"],
        "context": {
          "source": "control_api"
        },
        "createdAt": "2026-06-24T00:00:00.000Z",
        "updatedAt": "2026-06-24T00:00:00.000Z",
        "resolvedAt": null,
        "cancelledAt": null
      }
    ]
  }
}
```

## `POST /api/v1/tickets`

Creates a ticket for the authenticated user.

Required scope:

```text
tickets:write
```

Request body:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `title` | string | Yes | Must not be empty |
| `description` | string | No | Free text |
| `type` | enum | No | Defaults to `task` |
| `explicitUrgency` | enum | No | `low`, `medium`, `high`, `critical` |
| `tags` | string array | No | User/client tags |
| `context` | object | No | API adds `source: control_api` |

Example:

```bash
curl -s \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: session_token=$SESSION_TOKEN" \
  http://localhost:8080/api/v1/tickets \
  -d '{
    "title": "Control API smoke test",
    "description": "Created from curl.",
    "type": "task",
    "explicitUrgency": "medium",
    "tags": ["api", "curl"],
    "context": {
      "client": "curl"
    }
  }'
```

Response status:

```text
201 Created
```

Response:

```json
{
  "data": {
    "ticket": {
      "id": "ticket-id",
      "number": 42,
      "title": "Control API smoke test",
      "type": "task",
      "status": "open"
    }
  }
}
```

## `GET /api/v1/tickets/:id`

Returns a ticket and its current event timeline.

Required scope:

```text
tickets:read
```

Example:

```bash
curl -s \
  -H "Cookie: session_token=$SESSION_TOKEN" \
  http://localhost:8080/api/v1/tickets/$TICKET_ID
```

Response:

```json
{
  "data": {
    "ticket": {
      "id": "ticket-id",
      "number": 42,
      "title": "Control API smoke test",
      "status": "open"
    },
    "events": [
      {
        "id": "event-id",
        "ticketId": "ticket-id",
        "type": "created",
        "actor": {
          "type": "user",
          "runId": null
        },
        "previousValue": null,
        "newValue": {
          "title": "Control API smoke test"
        },
        "notes": null,
        "createdAt": "2026-06-24T00:00:00.000Z"
      }
    ]
  }
}
```

## `GET /api/v1/tickets/:id/events`

Returns only the ticket event timeline. This is the preferred endpoint for clients
that already have the ticket resource and only need changes/audit history.

Required scope:

```text
tickets:read
```

Example:

```bash
curl -s \
  -H "Cookie: session_token=$SESSION_TOKEN" \
  http://localhost:8080/api/v1/tickets/$TICKET_ID/events
```

Response:

```json
{
  "data": {
    "events": [
      {
        "id": "event-id",
        "ticketId": "ticket-id",
        "type": "created",
        "actor": {
          "type": "user",
          "runId": null
        },
        "previousValue": null,
        "newValue": {
          "title": "Control API smoke test"
        },
        "notes": null,
        "createdAt": "2026-06-24T00:00:00.000Z"
      }
    ]
  }
}
```

## `PATCH /api/v1/tickets/:id`

Updates mutable ticket fields.

Required scope:

```text
tickets:write
```

Request body:

| Field | Type | Notes |
|---|---|---|
| `status` | `open`, `in_progress`, `resolved`, `cancelled` | Optional |
| `resolutionNotes` | string | Used when resolving |
| `resolvedByType` | `user`, `agent` | Optional |
| `assignedToType` | `user`, `agent`, `null` | Optional |
| `contextPatch` | object | Merged into existing context |

Example:

```bash
curl -s \
  -X PATCH \
  -H "Content-Type: application/json" \
  -H "Cookie: session_token=$SESSION_TOKEN" \
  http://localhost:8080/api/v1/tickets/$TICKET_ID \
  -d '{
    "status": "resolved",
    "resolutionNotes": "Resolved from API smoke test."
  }'
```

Response:

```json
{
  "data": {
    "ticket": {
      "id": "ticket-id",
      "status": "resolved",
      "resolutionNotes": "Resolved from API smoke test."
    }
  }
}
```

## `DELETE /api/v1/tickets/:id`

Deletes a ticket owned by the authenticated user.

Required scope:

```text
tickets:write
```

Example:

```bash
curl -s \
  -X DELETE \
  -H "Cookie: session_token=$SESSION_TOKEN" \
  http://localhost:8080/api/v1/tickets/$TICKET_ID
```

Response:

```json
{
  "data": {
    "deleted": true
  }
}
```
