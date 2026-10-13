# Notes API

Notes endpoints expose the user's note collection through the Control API.
Notes are embedded locally through Ollama for semantic search. Keyword search remains
available when the local embedding service is unavailable.

## Scopes

| Endpoint | Scope |
|---|---|
| `GET /api/v1/notes` | `notes:read` |
| `GET /api/v1/notes/search` | `notes:read` |
| `GET /api/v1/notes/tags` | `notes:read` |
| `GET /api/v1/notes/:id` | `notes:read` |
| `POST /api/v1/notes` | `notes:write` |
| `PATCH /api/v1/notes/:id` | `notes:write` |
| `DELETE /api/v1/notes/:id` | `notes:write` |

Browser sessions can call these endpoints without API key scopes. Every endpoint also requires access to the `notes` domain (admins, or users granted it in `user_domain_access`); otherwise it returns `403`.

Notes form a page tree: each note may have a `parentId`. Archived notes are hidden from lists and search unless stated otherwise.

## `GET /api/v1/notes`

Lists notes owned by the authenticated user.

Query parameters:

| Name | Type | Notes |
|---|---|---|
| `tag` | string | Filter by tag |
| `due_on` | date string (`YYYY-MM-DD`) | Filter notes due on this date |
| `due_before` | date string (`YYYY-MM-DD`) | Filter notes due before this date |
| `overdue` | boolean | `true` to return only overdue notes |
| `limit` | integer, 1-100 | Optional, defaults to 50 |
| `parent_id` | `root` or UUID | List only top-level pages (`root`) or the direct children of a page, in page order. Other filters are ignored. `404` if the parent is not yours |
| `include_archived` | `true`/`false` | Include archived notes (default `false`) |

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/notes?tag=api&limit=20"
```

Response:

```json
{
  "data": {
    "notes": [
      {
        "id": "note-id",
        "title": "Control API plan",
        "content": "Implement documents, notes, jobs, skills, health, finance.",
        "tags": ["api", "planning"],
        "source": "chat",
        "dueDate": null,
        "parentId": null,
        "position": 0,
        "icon": null,
        "archivedAt": null,
        "createdAt": "2026-06-25T10:00:00.000Z",
        "updatedAt": "2026-06-25T10:00:00.000Z"
      }
    ]
  }
}
```

## `GET /api/v1/notes/search`

Searches notes using vector similarity when an embedding token is configured,
falling back to keyword search otherwise.

Query parameters:

| Name | Type | Required | Notes |
|---|---|---:|---|
| `q` | string | Yes | Search query |

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/notes/search?q=control+api"
```

Response:

```json
{
  "data": {
    "results": [
      {
        "id": "note-id",
        "title": "Control API plan",
        "content": "Implement documents, notes, jobs, skills, health, finance.",
        "tags": ["api", "planning"],
        "similarity": 0.92,
        "createdAt": "2026-06-25T10:00:00.000Z"
      }
    ]
  }
}
```

## `GET /api/v1/notes/tags`

Returns all distinct tags used across the authenticated user's notes.

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/notes/tags
```

Response:

```json
{
  "data": {
    "tags": ["api", "planning", "research"]
  }
}
```

## `POST /api/v1/notes`

Creates a note.

Request body:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `content` | string | Yes | Note body (Markdown supported) |
| `title` | string | No | Optional title |
| `tags` | string array | No | User-defined tags |
| `source` | string | No | Defaults to `"api"` |
| `due_date` | date string | No | ISO date, e.g. `"2026-07-01"` |
| `parent_id` | UUID or null | No | Create the note under this page (`404` if it is not yours) |

Example:

```bash
curl -s \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/notes \
  -d '{
    "title": "API reminder",
    "content": "Ship notes endpoint by end of week.",
    "tags": ["api", "todo"],
    "due_date": "2026-07-01"
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
    "note": {
      "id": "note-id",
      "title": "API reminder",
      "content": "Ship notes endpoint by end of week.",
      "tags": ["api", "todo"],
      "source": "api",
      "dueDate": "2026-07-01T00:00:00.000Z",
      "createdAt": "2026-06-25T10:00:00.000Z",
      "updatedAt": "2026-06-25T10:00:00.000Z"
    }
  }
}
```

## `GET /api/v1/notes/:id`

Returns one note with its ancestor path (root first) and its direct, non-archived children.

```json
{
  "data": {
    "note": { "id": "note-id", "title": "Child", "parentId": "parent-id", "...": "..." },
    "path": [{ "id": "parent-id", "title": "Parent", "icon": null }],
    "children": [{ "id": "c1", "title": "Grandchild", "parentId": "note-id", "position": 0, "icon": null, "updatedAt": "2026-06-25T10:00:00.000Z" }]
  }
}
```

## `PATCH /api/v1/notes/:id`

Updates mutable note fields. All fields are optional.

Request body:

| Field | Type | Notes |
|---|---|---|
| `content` | string | Replace note body |
| `title` | string or null | Set or clear title |
| `tags` | string array | Replaces existing tags |
| `due_date` | date string or null | Set or clear due date |
| `parent_id` | UUID or null | Move the note under a page, or to the top level with `null`. `409` if it would create a cycle |
| `position` | integer >= 0 | Position among its siblings (defaults to last when moving) |
| `archived` | boolean | Archive or restore the note together with its sub-pages |

Example:

```bash
curl -s \
  -X PATCH \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/notes/$NOTE_ID \
  -d '{"tags": ["api", "done"]}'
```

Response:

```json
{
  "data": {
    "note": {
      "id": "note-id",
      "title": "API reminder",
      "content": "Ship notes endpoint by end of week.",
      "tags": ["api", "done"],
      "source": "api",
      "dueDate": "2026-07-01T00:00:00.000Z",
      "createdAt": "2026-06-25T10:00:00.000Z",
      "updatedAt": "2026-06-25T11:00:00.000Z"
    }
  }
}
```

## `DELETE /api/v1/notes/:id`

Deletes a note owned by the authenticated user.

Example:

```bash
curl -s \
  -X DELETE \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/notes/$NOTE_ID
```

Response:

```json
{
  "data": {
    "deleted": true
  }
}
```
