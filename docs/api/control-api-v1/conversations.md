# Conversations

Conversation endpoints expose chat conversation metadata and message history through
the Control API. Sending messages to the assistant is intentionally deferred to a
separate chat/message contract.

Required scopes:

| Endpoint | Scope |
|---|---|
| `GET /api/v1/conversations` | `chat:read` |
| `POST /api/v1/conversations` | `chat:write` |
| `GET /api/v1/conversations/:id/messages` | `chat:read` |

Browser sessions can call these endpoints without API key scopes.

## `GET /api/v1/conversations`

Lists conversations owned by the authenticated user.

Query params:

| Name | Type | Notes |
|---|---|---|
| `domainSlug` | string | Optional domain filter |
| `limit` | integer | Optional, `1` to `100`, defaults to `50` |

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/conversations?domainSlug=chat&limit=10"
```

Response:

```json
{
  "data": {
    "conversations": [
      {
        "id": "conversation-id",
        "title": "API planning",
        "domainSlug": "chat",
        "pinned": false,
        "createdAt": "2026-06-24T00:00:00.000Z",
        "updatedAt": "2026-06-24T01:00:00.000Z"
      }
    ]
  }
}
```

## `POST /api/v1/conversations`

Creates a conversation owned by the authenticated user.

Request:

```json
{
  "title": "Headless chat",
  "domainSlug": "chat"
}
```

Fields:

| Name | Required | Notes |
|---|---:|---|
| `title` | yes | Conversation title |
| `domainSlug` | no | Defaults to `chat` |

Example:

```bash
curl -s \
  -X POST \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Headless chat","domainSlug":"chat"}' \
  http://localhost:8080/api/v1/conversations
```

## `GET /api/v1/conversations/:id/messages`

Returns message history for an owned conversation.

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/conversations/$CONVERSATION_ID/messages
```

Response:

```json
{
  "data": {
    "messages": [
      {
        "id": "message-id",
        "conversationId": "conversation-id",
        "role": "user",
        "content": "Hello",
        "agentRunId": null,
        "createdAt": "2026-06-24T02:00:00.000Z"
      }
    ]
  }
}
```
