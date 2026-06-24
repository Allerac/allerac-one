# Control API v1

## Status

In progress. The implemented v1 surface supports browser session authentication
and Control API bearer keys.

## Base URL

Local Docker deployment:

```text
http://localhost:8080
```

All v1 endpoints are under:

```text
/api/v1
```

## Authentication

### Browser Session

Use the same `session_token` cookie used by the Allerac web UI:

```http
Cookie: session_token=<value>
```

This is useful for UI-backed testing and for creating API keys.

### API Keys

API keys use bearer tokens:

```http
Authorization: Bearer alr_live_<key>
```

The full key is returned once on creation. Allerac stores only a token hash.

## Response Envelopes

Successful responses always use:

```json
{
  "data": {}
}
```

Errors always use:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Invalid ticket payload",
    "details": {}
  }
}
```

Common error codes:

| Code | Status | Meaning |
|---|---:|---|
| `unauthorized` | 401 | No valid session or API key |
| `forbidden` | 403 | Authenticated but not allowed |
| `not_found` | 404 | Resource not found or not owned by the user |
| `validation_error` | 400 | Query string or body failed validation |
| `internal_error` | 500 | Unexpected server failure |

## Resources

| Resource | Endpoints |
|---|---|
| [System](system.md) | `GET /me`, `GET /domains` |
| [API Keys](api-keys.md) | list, create, revoke |
| [Tickets](tickets.md) | list, create, get, update, delete, events |
| [Agent Runs](agent-runs.md) | list, create, get, cancel |

## Bruno Collection

Open the collection folder directly:

```text
bruno/Allerac-One
```

Use the `Local` environment:

| Variable | Value |
|---|---|
| `baseUrl` | `http://localhost:8080` |
| `sessionToken` | Browser `session_token` cookie value |
| `ticketId` | Set automatically by `Tickets / Create Ticket` |
| `agentRunId` | Set automatically by `Agent Runs / Create Agent Run` |

Recommended smoke order:

1. `System / Me`
2. `System / List Domains`
3. `Tickets / List Tickets`
4. `Tickets / Create Ticket`
5. `Tickets / Get Ticket`
6. `Tickets / List Ticket Events`
7. `Tickets / Resolve Ticket`
8. `Tickets / List Ticket Events`
9. `Tickets / Delete Ticket`
10. `Agent Runs / List Agent Runs`
11. `Agent Runs / Create Agent Run`
12. `Agent Runs / Get Agent Run`
13. `Agent Runs / Cancel Agent Run`

## OpenAPI

The machine-readable contract lives at:

```text
docs/api/openapi/control-api-v1.yaml
```

Use it for agent integration, client generation experiments, and contract review.
The OpenAPI file should be updated in the same PR that changes any `/api/v1`
request or response shape.

## Contract Maintenance Rules

- Update these reference pages for every `/api/v1` request or response change.
- Update `docs/api/openapi/control-api-v1.yaml` in the same PR.
- Update the Bruno collection when a route can be smoke-tested manually.
- Keep architecture decisions in ADRs, not in the API reference.
