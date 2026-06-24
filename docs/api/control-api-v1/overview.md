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
| [Conversations](conversations.md) | list, create, messages |
| [Memories](memories.md) | list, create from conversation, delete |
| [Tickets](tickets.md) | list, create, get, update, delete, events |
| [Agent Runs](agent-runs.md) | list, create, get, cancel |
| [Documents](documents.md) | list, upload, delete |
| [Notes](notes.md) | list, search, tags, create, update, delete |
| [Scheduled Jobs](scheduled-jobs.md) | list, create, update, toggle, executions, delete |
| [Skills](skills.md) | list, get, create, update, delete |
| [Health](health.md) | status, summary, daily, activities |
| [Finance](finance.md) | watchlist list, add, remove |

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
| `conversationId` | Set automatically by `Conversations / Create Conversation` |
| `memoryId` | Set automatically by `Memories / Create Conversation Memory` |

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
14. `Conversations / List Conversations`
15. `Conversations / Create Conversation`
16. `Conversations / List Messages`
17. `Memories / Create Conversation Memory`
18. `Memories / List Memories`
19. `Memories / Delete Memory`
20. `Documents / List Documents`
21. `Documents / Upload Document`
22. `Documents / Delete Document`
23. `Notes / List Notes`
24. `Notes / Create Note`
25. `Notes / Search Notes`
26. `Notes / List Note Tags`
27. `Notes / Update Note`
28. `Notes / Delete Note`
29. `Scheduled Jobs / List Jobs`
30. `Scheduled Jobs / Create Job`
31. `Scheduled Jobs / Toggle Job`
32. `Scheduled Jobs / Update Job`
33. `Scheduled Jobs / List Job Executions`
34. `Scheduled Jobs / Delete Job`
35. `Skills / List Skills`
36. `Skills / Create Skill`
37. `Skills / Get Skill`
38. `Skills / Update Skill`
39. `Skills / Delete Skill`
40. `Health / Health Status`
41. `Health / Health Summary`
42. `Health / Daily Health`
43. `Health / List Activities`
44. `Finance / Get Watchlist`
45. `Finance / Add to Watchlist`
46. `Finance / Remove from Watchlist`

Memory creation requires `conversationId` to point to an owned conversation with
enough messages to summarize. A newly created empty conversation should return
`not_enough_content`.

Document upload requires setting the file path in `Upload Document` before running.
Health endpoints return empty/default data if Garmin is not connected.

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
