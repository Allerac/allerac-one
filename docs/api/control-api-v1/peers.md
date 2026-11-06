# Peers

Peers are other Allerac Units this Unit is paired with (or pairing with). See
[Federation Pairing](../federation-pairing.md) for the handshake.

All endpoints are admin-only and require a browser session. API and service
keys cannot call them.

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/peers` | List peers (no secrets) |
| `POST /api/v1/peers/discover` | `{url}` → validated manifest preview; creates nothing |
| `POST /api/v1/peers` | `{url, grants, requested?}` → start pairing; returns the pending peer and its verification code |
| `POST /api/v1/peers/:id/accept` | `{grants?}` → accept an inbound request (defaults to the requested capabilities) |
| `POST /api/v1/peers/:id/reject` | Reject an inbound request |
| `DELETE /api/v1/peers/:id` | Revoke an active pairing or cancel a pending one |

## Peer Object

```json
{
  "id": "…",
  "unitName": "unit2",
  "displayName": "Unit 2",
  "origin": "https://unit2.example",
  "initiatedByUs": true,
  "status": "pending_outbound",
  "inboundCapabilities": ["federation.agents.list"],
  "outboundCapabilities": ["federation.agents.list", "federation.agents.ask"],
  "outboundKeyPrefix": null,
  "verificationCode": "123456",
  "expiresAt": "2026-10-28T13:15:00.000Z",
  "decidedAt": null,
  "lastSeenAt": null,
  "createdAt": "2026-10-28T13:00:00.000Z"
}
```

- `inboundCapabilities`: what this Unit grants the peer.
- `outboundCapabilities`: what the peer grants this Unit.
- `status`: `pending_outbound`, `pending_inbound`, `active`, `rejected`, `expired`, `revoked`.
- `verificationCode` is only present while pending.

## Audit log

`GET /api/v1/peers/:id/audit?limit=50` returns recent federation calls to and
from this peer (newest first, max 200). Entries hold metadata only: direction,
capability, target agent, outcome, status, error code, duration and sizes. See
[Federation Agents](../federation-agents.md#audit-log).

## Errors

| Code | Status | Meaning |
|---|---|---|
| `invalid_url` / `insecure_url` | 400 | URL is invalid, or not https/public without `ALLERAC_FEDERATION_ALLOW_INSECURE` |
| `validation_error` | 400 | Payload or capability ids are invalid |
| `peer_not_accepting` | 409 | The peer does not accept pairing |
| `conflict` | 409 | A pairing with that Unit already exists or is pending |
| `local_url_missing` | 409 | `ALLERAC_PUBLIC_URL` is not set |
| `invalid_state` | 409 | Action not allowed in the current status |
| `expired` | 410 | Pending request expired |
| `protocol_mismatch` | 422 | Unsupported federation protocol version |
| `peer_unreachable` / `peer_invalid_response` | 502 | The peer could not be reached or answered unexpectedly |
