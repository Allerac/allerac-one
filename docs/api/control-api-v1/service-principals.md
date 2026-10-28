# Service Principals

A service principal is a non-human identity for another Allerac Unit (a *peer*).
It is the first building block of [Allerac Federation](../../architecture/allerac-federation.md)
(roadmap phase P0, see [Federation Protocol](../../roadmap/federation-protocol.md)).

- Each principal acts as one local user (`actingUserId`, defaults to the creating
  admin). Ownership checks run against that user, but the principal never has
  admin rights.
- Principal keys are regular `alr_live_` bearer tokens bound to the principal.
  They do not appear in the personal [API Keys](api-keys.md) list.
- Service keys may only hold scopes from the service allow-list.
- Disabling a principal stops all of its keys immediately.
- Every request made with a service key is recorded (key, principal, scope,
  allowed or denied, time).

Management endpoints are admin-only and require a browser session. API keys and
service keys cannot call them.

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/service-principals` | List principals |
| `POST /api/v1/service-principals` | Create a principal (`name`, optional `peerUrl`, `actingUserId`) |
| `GET /api/v1/service-principals/:id` | Get one principal |
| `DELETE /api/v1/service-principals/:id` | Disable a principal |
| `POST /api/v1/service-principals/:id/keys` | Issue a key (`name`, `scopes`, optional `expiresAt`); the secret is returned once |

## Service Allow-List

| Scope | Purpose |
|---|---|
| `profile:read` | Call `GET /api/v1/me` to confirm the principal identity |
| `capabilities:read` | Read non-secret capability status |
| `federation:manifest:read` | Read federation manifest details (P1) |
| `federation:agents:list` | List agents exposed to peers (P3) |
| `federation:agents:ask` | Ask a local agent a quick question (P3/P4) |
| `federation:runs:create` | Create a cross-unit agent run (P5) |
| `federation:runs:read` | Read cross-unit agent run status (P5) |
| `federation:peer:revoke` | A paired Unit ends its own pairing ([Federation Pairing](../federation-pairing.md)) |

Federation scopes are defined now so keys can be issued ahead of the routes that
consume them.

## `GET /api/v1/me` With a Service Key

```json
{
  "data": {
    "user": null,
    "principal": { "type": "service", "id": "…", "name": "openworld", "kind": "peer" },
    "cliPreferences": null
  }
}
```

Session and personal-key callers receive `"principal": { "type": "user" }` and
the usual `user` object.
