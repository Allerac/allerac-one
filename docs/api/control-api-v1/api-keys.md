# API Keys

API keys let external clients call the Control API without a browser session.
Key management endpoints require a valid browser session; API keys are for
calling other Control API resources.

API keys are bearer tokens:

```http
Authorization: Bearer alr_live_<secret>
```

The full secret is returned only once when the key is created. Allerac stores only
a hash of the token.

If `scopes` is empty, the key can call any Control API route available to the
owning user. If scopes are set, the key must include the route's required scope.

## `GET /api/v1/api-keys`

Lists API keys owned by the authenticated user. Secrets are never returned.

Example:

```bash
curl -s \
  -H "Cookie: session_token=$SESSION_TOKEN" \
  http://localhost:8080/api/v1/api-keys
```

Response:

```json
{
  "data": {
    "apiKeys": [
      {
        "id": "key-id",
        "name": "Bruno",
        "prefix": "alr_live_abc123",
        "scopes": [],
        "lastUsedAt": null,
        "revokedAt": null,
        "expiresAt": null,
        "createdAt": "2026-06-24T00:00:00.000Z"
      }
    ]
  }
}
```

## `POST /api/v1/api-keys`

Creates a new API key for the authenticated user.

Example:

```bash
curl -s \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: session_token=$SESSION_TOKEN" \
  -d '{"name":"Bruno"}' \
  http://localhost:8080/api/v1/api-keys
```

Response:

```json
{
  "data": {
    "apiKey": {
      "id": "key-id",
      "name": "Bruno",
      "prefix": "alr_live_abc123",
      "scopes": [],
      "lastUsedAt": null,
      "revokedAt": null,
      "expiresAt": null,
      "createdAt": "2026-06-24T00:00:00.000Z"
    },
    "secret": "alr_live_full_secret"
  }
}
```

Use the secret as a bearer token:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/me
```

## `DELETE /api/v1/api-keys/:id`

Revokes an API key owned by the authenticated user.

Example:

```bash
curl -s \
  -X DELETE \
  -H "Cookie: session_token=$SESSION_TOKEN" \
  http://localhost:8080/api/v1/api-keys/key-id
```

Response:

```json
{
  "data": {
    "revoked": true
  }
}
```
