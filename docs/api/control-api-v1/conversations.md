# Conversations

Conversation endpoints expose chat conversation metadata, message history, and
synchronous assistant message execution through the Control API.

Required scopes:

| Endpoint | Scope |
|---|---|
| `GET /api/v1/conversations` | `chat:read` |
| `POST /api/v1/conversations` | `chat:write` |
| `GET /api/v1/conversations/:id/messages` | `chat:read` |
| `POST /api/v1/conversations/:id/messages` | `chat:write` |

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

## `POST /api/v1/conversations/:id/messages`

Sends a user message to an owned conversation and returns the final assistant
response after it is generated. This first v1 contract is synchronous and non-streaming.
Tool events are returned as an aggregated event list.

Request:

```json
{
  "message": "Summarize the current plan",
  "model": "gpt-4o",
  "provider": "github"
}
```

Fields:

| Name | Required | Notes |
|---|---:|---|
| `message` | yes, unless images are provided | Max `100000` chars |
| `model` | yes | Model id to execute |
| `provider` | yes | `github`, `ollama`, `gemini`, or `anthropic` |
| `imageAttachments` | no | Up to 5 `data:image/*` or `https://` URLs |
| `postContext` | no | Extra domain context, max `20000` chars |

Example:

```bash
curl -s \
  -X POST \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message":"Summarize the current plan","model":"gpt-4o","provider":"github"}' \
  http://localhost:8080/api/v1/conversations/$CONVERSATION_ID/messages
```

Response:

```json
{
  "data": {
    "message": {
      "conversationId": "conversation-id",
      "role": "assistant",
      "content": "Here is the summary..."
    },
    "events": [
      {
        "type": "token",
        "content": "Here"
      }
    ]
  }
}
```

Provider configuration errors return `422 provider_not_configured`. Rate and
concurrency limits return `429`.
