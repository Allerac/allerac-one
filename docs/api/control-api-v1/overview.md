# Control API v1

## Status

Beta baseline complete. The implemented v1 surface contains 44 route paths and 61
operations, supports browser session authentication and scoped Control API bearer
keys, and is deployed as a production client surface. Standalone tool execution,
streaming chat, and legacy UI migration are deferred evolutions rather than beta
baseline blockers.

## Base URL

Local Docker deployment:

```text
http://localhost:8080
```

Production deployments should use the HTTPS Control API hostname, for example:

```text
https://app.allerac.ai
```

When Cloudflare is in front of the deployment, `/api/v1/*` must allow bearer-token
API clients through without browser challenges or caching. See
[ADR 0003](../../architecture/decisions/0003-expose-control-api-through-cloudflare-path-policy.md).

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
| [System](system.md) | `GET /version`, `GET /me`, `GET /domains`, `GET /capabilities` |
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
| [Search](search.md) | web search |
| [Robot](robot.md) | speech synthesis, get/update robot settings |
| [Email](email.md) | list messages, get message, send |
| [Finance](finance.md) | quotes, symbol search, candles, watchlist list, add, remove |
| [Benchmark](benchmark.md) | model availability, run via SSE, history, clear history |

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
| `emailAccountId` | Email account id to test IMAP/SMTP endpoints |
| `emailMessageUid` | IMAP UID to test `Email / Get Message` |

Recommended smoke order:

Start with `System / Version` to record the deployment identity, then continue with
the authenticated resource flow:

1. `System / Me`
2. `System / List Domains`
3. `System / Capabilities`
4. `Tickets / List Tickets`
5. `Tickets / Create Ticket`
6. `Tickets / Get Ticket`
7. `Tickets / List Ticket Events`
8. `Tickets / Resolve Ticket`
9. `Tickets / List Ticket Events`
10. `Tickets / Delete Ticket`
11. `Agent Runs / List Agent Runs`
12. `Agent Runs / Create Agent Run`
13. `Agent Runs / Get Agent Run`
14. `Agent Runs / Cancel Agent Run`
15. `Conversations / List Conversations`
16. `Conversations / Create Conversation`
17. `Conversations / Send Message`
18. `Conversations / List Messages`
19. `Memories / Create Conversation Memory`
20. `Memories / List Memories`
21. `Memories / Delete Memory`
22. `Documents / List Documents`
23. `Documents / Upload Document`
24. `Documents / Delete Document`
25. `Notes / List Notes`
26. `Notes / Create Note`
27. `Notes / Search Notes`
28. `Notes / List Note Tags`
29. `Notes / Update Note`
30. `Notes / Delete Note`
31. `Scheduled Jobs / List Jobs`
32. `Scheduled Jobs / Create Job`
33. `Scheduled Jobs / Toggle Job`
34. `Scheduled Jobs / Update Job`
35. `Scheduled Jobs / Run Job`
36. `Scheduled Jobs / List Job Executions`
37. `Scheduled Jobs / Delete Job`
38. `Skills / List Skills`
39. `Skills / Create Skill`
40. `Skills / Get Skill`
41. `Skills / Update Skill`
42. `Skills / Delete Skill`
43. `Health / Health Status`
44. `Health / Health Summary`
45. `Health / Daily Health`
46. `Health / List Activities`
47. `Search / Web Search`
48. `Robot / Get Settings`
49. `Robot / Synthesize Speech`
50. `Email / List Messages`
51. `Email / Get Message`
52. `Email / Send Email`
53. `Finance / Get Quotes`
54. `Finance / Search Symbols`
55. `Finance / Get Candles`
56. `Finance / Get Watchlist`
57. `Finance / Add to Watchlist`
58. `Finance / Remove from Watchlist`

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
