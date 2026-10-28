# Federation Pairing

Pairing connects two Allerac Units explicitly, like Bluetooth pairing. It
implements roadmap phase P2 of the [Federation Protocol](../roadmap/federation-protocol.md).
Discovery (reading a [manifest](federation-manifest.md)) never grants access;
only an accepted pairing does.

## Flow

```text
A admin  -> A: POST /api/v1/peers {url, grants}
A        -> B: GET  /.well-known/allerac               (must accept pairing)
A        -> B: POST /api/v1/federation/pairing         (nonce + one-time pairing secret)
B        -> A: GET  /.well-known/allerac               (confirms the claimed origin)
B        => pending request, both admins see the same 6-digit verification code
B admin  -> B: POST /api/v1/peers/:id/accept {grants}
B        -> A: POST /api/v1/federation/pairing/:id/complete  (pairing secret + key for A)
A        => verifies, stores B's key encrypted, returns its key for B
both     => peer is active
```

- Nothing is granted until the responder's admin accepts.
- Admins should compare the verification code shown on both Units before accepting.
- Pending requests expire after 15 minutes. At most 20 inbound requests can be pending.
- Grants are capability ids (see the manifest's capability table). They map to
  service scopes; every pairing key also carries `federation:peer:revoke`.
- Each side represents the other as a [service principal](control-api-v1/service-principals.md)
  acting as the admin who accepted or started the pairing.
- The key a peer issued to us is stored encrypted with `ENCRYPTION_KEY` and is
  never returned by any API.

## Settings > Discovery

Admins manage pairing from **Settings > Discovery**: look up a Unit by URL,
choose what to request and what to allow, send the request, compare the
verification code, accept or reject inbound requests, and disconnect paired
Units. Keys are never displayed.

## Revocation

`DELETE /api/v1/peers/:id` on either Unit disables the local principal for the
peer immediately, deletes the stored key, and notifies the peer
(`POST /api/v1/federation/peer/revoke`, authenticated with the pairing key).
It also cancels a pending pairing.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ALLERAC_PUBLIC_URL` | (required for pairing) | This Unit's own origin; peers call it back here |
| `ALLERAC_PAIRING_ACCEPT` / `ALLERAC_PAIRING_ACCEPT_PUBLIC` | `false` | Accept inbound pairing requests (see [manifest](federation-manifest.md#configuration)) |
| `ALLERAC_FEDERATION_ALLOW_INSECURE` | `false` | Allow `http` and LAN/private hosts as peers (LAN, same host, development) |
| `RATE_LIMIT_FEDERATION_PAIRING_REQUESTS` / `RATE_LIMIT_FEDERATION_PAIRING_WINDOW_SECONDS` | `10` / `600` | Global limit for inbound pairing calls |

Starting a pairing does not require `ALLERAC_PAIRING_ACCEPT` on the initiator;
the responder must accept pairing.

## Endpoints

Admin endpoints are documented in [Peers](control-api-v1/peers.md).

| Endpoint | Authentication | Purpose |
|---|---|---|
| `POST /api/v1/federation/pairing` | none (closed unless pairing is accepted, rate limited) | Receive a pairing request; returns `202 {requestId, nonce}` |
| `POST /api/v1/federation/pairing/:id/complete` | one-time pairing secret | Responder completes a pairing we started; returns our key for it |
| `POST /api/v1/federation/peer/revoke` | peer service key | Peer ends the pairing |
