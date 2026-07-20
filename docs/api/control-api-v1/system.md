# System API

System endpoints expose the deployed build identity, describe the authenticated
caller, and report the capabilities visible to that caller.

## `GET /api/v1/version`

Returns the release, commit, and build timestamp baked into the running application
image. This endpoint is intentionally public so deployment automation and clients
can confirm which version they are reaching through the public edge.

No authentication or API key scope is required. The response uses
`Cache-Control: no-store, max-age=0` so Cloudflare and browsers do not retain stale
deployment identity.

Example:

```bash
curl -sS https://app.allerac.ai/api/v1/version
```

Response:

```json
{
  "data": {
    "release": "v0.0.13",
    "commit": "0d1cf337b6139af859e0ce6bc6498e6f0add6688",
    "builtAt": "2026-07-18T14:30:59Z"
  }
}
```

Development builds without `build-info.json` return `unreleased` and `unknown`
fallback values. The endpoint never returns environment variables, hostname,
provider credentials, or other runtime configuration.

## `GET /api/v1/me`

Returns the authenticated API user.

Required auth:

| Mode | Requirement |
|---|---|
| Session | Valid `session_token` cookie |
| API key | Valid `Authorization: Bearer alr_live_...` header |

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

With an API key, `authMode` is:

```json
"api_key"
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

## `GET /api/v1/capabilities`

Returns a safe capability map for the authenticated user. This endpoint reports
whether integrations and providers are configured and, when cheaply verifiable,
connected. It never returns API keys, tokens, encrypted values, or other secrets.

Required scope:

```text
capabilities:read
```

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/capabilities
```

Response:

```json
{
  "data": {
    "capabilities": {
      "llm": {
        "github": { "configured": true, "available": true },
        "gemini": { "configured": true, "available": true },
        "anthropic": { "configured": false, "available": false },
        "ollama": { "configured": true, "connected": true, "available": true }
      },
      "search": {
        "tavily": { "configured": true, "available": true }
      },
      "notifications": {
        "telegram": { "configured": false, "available": false },
        "resend": { "configured": false, "available": false }
      },
      "storage": {
        "azureBlob": { "configured": false, "available": false }
      },
      "social": {
        "instagram": { "configured": false, "connected": false, "available": false },
        "tiktok": { "configured": false, "connected": false, "available": false }
      },
      "email": {
        "imap": { "configured": false, "available": false },
        "smtp": { "configured": false, "available": false }
      },
      "health": {
        "garmin": { "configured": false, "connected": false, "available": false }
      }
    },
    "defaults": {
      "chatModel": "gemini-2.5-flash"
    }
  }
}
```
