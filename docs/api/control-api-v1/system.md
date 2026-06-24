# System API

System endpoints describe the authenticated caller and the capabilities visible to
that caller.

## `GET /api/v1/me`

Returns the authenticated API user.

Required auth:

| Mode | Requirement |
|---|---|
| Session | Valid `session_token` cookie |
| API key | Planned |

Example:

```bash
curl -s \
  -H "Cookie: session_token=$SESSION_TOKEN" \
  http://localhost:8080/api/v1/me
```

Response:

```json
{
  "data": {
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "name": "User",
      "isAdmin": false,
      "authMode": "session"
    }
  }
}
```

## `GET /api/v1/domains`

Lists active domains visible to the authenticated user. Admin users see every active
domain. Non-admin users only see domains granted through `user_domain_access`.

Required scope:

```text
domains:read
```

Example:

```bash
curl -s \
  -H "Cookie: session_token=$SESSION_TOKEN" \
  http://localhost:8080/api/v1/domains
```

Response:

```json
{
  "data": {
    "domains": [
      {
        "slug": "tickets",
        "displayName": "Tickets",
        "isActive": true,
        "defaultSkill": {
          "id": "skill-id",
          "name": "tickets",
          "displayName": "Tickets"
        }
      }
    ]
  }
}
```

