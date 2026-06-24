# Documents API

Documents endpoints expose the RAG knowledge base through the Control API.
Uploaded documents are chunked and embedded asynchronously; the document record
is returned immediately with `status: "processing"`.

## Scopes

| Endpoint | Scope |
|---|---|
| `GET /api/v1/documents` | `documents:read` |
| `POST /api/v1/documents` | `documents:write` |
| `DELETE /api/v1/documents/:id` | `documents:write` |

Browser sessions can call these endpoints without API key scopes.

## `GET /api/v1/documents`

Lists documents owned by the authenticated user.

Query parameters:

| Name | Type | Notes |
|---|---|---|
| `domainSlug` | string | Optional domain filter |
| `limit` | integer, 1-100 | Optional, defaults to 50 |

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/documents?domainSlug=notes&limit=20"
```

Response:

```json
{
  "data": {
    "documents": [
      {
        "id": "doc-id",
        "filename": "report.pdf",
        "fileType": "application/pdf",
        "fileSize": 204800,
        "domainSlug": "notes",
        "status": "completed",
        "errorMessage": null,
        "uploadedAt": "2026-06-25T10:00:00.000Z"
      }
    ]
  }
}
```

## `POST /api/v1/documents`

Uploads a document and starts async embedding processing.
Returns immediately with the document in `processing` status.

Request: `multipart/form-data`

| Field | Type | Required | Notes |
|---|---|---:|---|
| `file` | binary | Yes | Max 20 MB |
| `domainSlug` | string | No | Scopes the document to a domain |

Example:

```bash
curl -s \
  -X POST \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  -F "file=@report.pdf" \
  -F "domainSlug=notes" \
  http://localhost:8080/api/v1/documents
```

Response status:

```text
201 Created
```

Response:

```json
{
  "data": {
    "document": {
      "id": "doc-id",
      "filename": "report.pdf",
      "fileType": "application/pdf",
      "fileSize": 204800,
      "domainSlug": "notes",
      "status": "processing",
      "errorMessage": null,
      "uploadedAt": "2026-06-25T10:00:00.000Z"
    }
  }
}
```

Poll `GET /api/v1/documents` to check when `status` becomes `completed` or
`failed`.

## `DELETE /api/v1/documents/:id`

Deletes a document and all its embedding chunks.

Example:

```bash
curl -s \
  -X DELETE \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/documents/$DOCUMENT_ID
```

Response:

```json
{
  "data": {
    "deleted": true
  }
}
```
