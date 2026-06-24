# Memories

Memory endpoints expose reusable conversation summaries through the Control API.
They are separate from conversations: conversations store operational history,
memories store reusable context for future assistant runs.

Required scopes:

| Endpoint | Scope |
|---|---|
| `GET /api/v1/memories` | `memory:read` |
| `DELETE /api/v1/memories/:id` | `memory:write` |
| `POST /api/v1/conversations/:id/memory` | `memory:write` |

Browser sessions can call these endpoints without API key scopes.

## `POST /api/v1/conversations/:id/memory`

Creates or refreshes a memory summary from an owned conversation.

Example:

```bash
curl -s \
  -X POST \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/conversations/$CONVERSATION_ID/memory
```

Response:

```json
{
  "data": {
    "memory": {
      "id": "memory-id",
      "conversationId": "conversation-id",
      "summary": "User wants a clean Control API memory boundary.",
      "keyTopics": ["control-api", "memory"],
      "importanceScore": 7,
      "messageCount": 4,
      "domainSlug": "chat",
      "emotion": "focused",
      "createdAt": "2026-06-24T12:00:00.000Z"
    }
  }
}
```

Possible `422` errors for memory creation:

| Code | Meaning |
|---|---|
| `provider_not_configured` | No Google or GitHub model provider is configured for memory generation |
| `not_enough_content` | The conversation does not have enough messages to summarize |

## `GET /api/v1/memories`

Lists recent memory summaries owned by the authenticated user.

Query params:

| Name | Type | Notes |
|---|---|---|
| `domainSlug` | string | Optional domain filter |
| `limit` | integer | Optional, `1` to `100`, defaults to `20` |
| `minImportance` | integer | Optional, `1` to `10`, defaults to `1` |

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/memories?domainSlug=chat&limit=10&minImportance=5"
```

## `DELETE /api/v1/memories/:id`

Deletes an owned memory summary.

Example:

```bash
curl -s \
  -X DELETE \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/memories/$MEMORY_ID
```

Response:

```json
{
  "data": {
    "deleted": true
  }
}
```
