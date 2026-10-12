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

Scopes are deny-by-default:

- A key can only call routes whose required scope is explicitly listed on the key.
- `scopes` is required when creating a key and must contain at least one scope.
- Unknown scopes are rejected at creation (`400 validation_error`) and never
  grant access.
- There is no wildcard scope. To grant access to every route, list every scope
  (the admin UI "Full access" preset does this).
- A key with an empty scope list (only possible for keys created before this
  rule) grants nothing: every Control API call with it returns
  `403 missing_scope`. Revoke it and create a new key with explicit scopes.

Non-admin users can only create keys with the self-service scopes
(`health:proxy:read`, `chat:write`).

The default "Chat client" preset (`profile:read`, `chat:read`, `chat:write`,
`capabilities:read`) covers the terminal client (`scripts/allerac-chat.mjs`);
add `domains:read` to use its `/domains` command.

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
        "scopes": ["profile:read"],
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
  -d '{"name":"Bruno","scopes":["profile:read","chat:read","chat:write","capabilities:read"]}' \
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
      "scopes": ["profile:read", "chat:read", "chat:write", "capabilities:read"],
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
