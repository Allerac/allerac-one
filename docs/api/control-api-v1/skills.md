# Skills API

Skills endpoints expose the user's skill library through the Control API.
A skill is a named system-prompt configuration that can be activated on a
conversation to change assistant behavior.

## Scopes

| Endpoint | Scope |
|---|---|
| `GET /api/v1/skills` | `skills:read` |
| `GET /api/v1/skills/:id` | `skills:read` |
| `POST /api/v1/skills` | `skills:write` |
| `PATCH /api/v1/skills/:id` | `skills:write` |
| `DELETE /api/v1/skills/:id` | `skills:write` |

Browser sessions can call these endpoints without API key scopes.

## `GET /api/v1/skills`

Lists skills available to the authenticated user (owned + shared).

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/skills
```

Response:

```json
{
  "data": {
    "skills": [
      {
        "id": "skill-id",
        "name": "researcher",
        "displayName": "Researcher",
        "description": "Deep research assistant with web search.",
        "category": "workflow",
        "shared": false,
        "verified": false,
        "createdAt": "2026-06-01T00:00:00.000Z",
        "updatedAt": "2026-06-01T00:00:00.000Z"
      }
    ]
  }
}
```

## `GET /api/v1/skills/:id`

Returns a single skill including its full system prompt content.

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/skills/$SKILL_ID
```

Response:

```json
{
  "data": {
    "skill": {
      "id": "skill-id",
      "name": "researcher",
      "displayName": "Researcher",
      "description": "Deep research assistant with web search.",
      "systemPrompt": "You are a research specialist...",
      "category": "workflow",
      "shared": false,
      "verified": false,
      "createdAt": "2026-06-01T00:00:00.000Z",
      "updatedAt": "2026-06-01T00:00:00.000Z"
    }
  }
}
```

## `POST /api/v1/skills`

Creates a skill owned by the authenticated user.

Request body:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `name` | string | Yes | Unique slug-style identifier |
| `displayName` | string | Yes | Human-readable label |
| `description` | string | Yes | Short description |
| `systemPrompt` | string | Yes | Full system prompt content |
| `category` | string | No | Defaults to `"workflow"` |
| `shared` | boolean | No | Make skill visible to other users, defaults to `false` |

Example:

```bash
curl -s \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/skills \
  -d '{
    "name": "researcher",
    "displayName": "Researcher",
    "description": "Deep research assistant with web search.",
    "systemPrompt": "You are a research specialist...",
    "category": "workflow"
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
    "skill": {
      "id": "skill-id",
      "name": "researcher",
      "displayName": "Researcher",
      "description": "Deep research assistant with web search.",
      "category": "workflow",
      "shared": false,
      "verified": false,
      "createdAt": "2026-06-25T10:00:00.000Z",
      "updatedAt": "2026-06-25T10:00:00.000Z"
    }
  }
}
```

## `PATCH /api/v1/skills/:id`

Updates mutable skill fields. All fields are optional.

Request body:

| Field | Type | Notes |
|---|---|---|
| `name` | string | Slug-style identifier |
| `displayName` | string | Human-readable label |
| `description` | string | Short description |
| `systemPrompt` | string | Full system prompt content |
| `category` | string | Skill category |
| `shared` | boolean | Visibility to other users |

Example:

```bash
curl -s \
  -X PATCH \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/skills/$SKILL_ID \
  -d '{"shared": true}'
```

Response:

```json
{
  "data": {
    "skill": {
      "id": "skill-id",
      "name": "researcher",
      "shared": true
    }
  }
}
```

## `DELETE /api/v1/skills/:id`

Deletes a skill owned by the authenticated user.

Example:

```bash
curl -s \
  -X DELETE \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/skills/$SKILL_ID
```

Response:

```json
{
  "data": {
    "deleted": true
  }
}
```
