# Federation Manual Checklist

Manual checks for pairing (P2) and peer agents (P3) between two Units, for
example napols and a second Unit on the same host
(see [Multi-Unit](multi-unit.md)).

## Pairing (P2)

- [ ] Migrations 142, 143 and 144 applied on both Units (`federation_peers`, `service_principals`, `federation_audit_log`).
- [ ] Both env files set `ALLERAC_PUBLIC_URL=https://<own-host>` and `ENCRYPTION_KEY`; restart.
- [ ] Second Unit: `ALLERAC_PAIRING_ACCEPT=true`; the first may leave it off.
- [ ] `curl https://<unit2>/.well-known/allerac` shows `pairing.accepting: true`; the other Unit shows `false` unless enabled.
- [ ] `curl -X POST https://<unit1>/api/v1/federation/pairing -d '{}'` returns `404` when pairing is off.
- [ ] Settings > Discovery: looking up the second Unit's URL shows its name and release.
- [ ] Looking up a public Unit (e.g. openworld) shows "not accepting pairing requests" and no send button.
- [ ] Sending a request shows "Waiting for approval" and a 6-digit code.
- [ ] The other Unit's Settings > Discovery lists the request with the **same** code.
- [ ] Reject once; the request stays pending until expiry; send again.
- [ ] Accept (adjust grants): both sides show "Paired" with mirrored capabilities.
- [ ] No key is visible in the UI or in `GET /api/v1/peers` responses.
- [ ] DB: `federation_peers.outbound_key_encrypted` is ciphertext; `pairing_secret_*` columns are NULL.
- [ ] `service_principals` has a `peer:<unit>:…` row on each side; `control_api_key_usage` gets rows after use.
- [ ] A second request while paired fails with "already exists or is pending".
- [ ] Disconnect on one side: both show "Revoked" (the other after refresh).
- [ ] A pending request older than 15 minutes shows "Expired".
- [ ] More than 10 pairing calls in 10 minutes return `429`.
- [ ] Behind Cloudflare: `/.well-known/allerac` and `/api/v1/federation/*` are reachable; `cf-connecting-ip` is stored as `request_ip`.

## Peer agents (P3)

- [ ] Second Unit: `ALLERAC_FEDERATION_AGENTS=health` (or another private domain); restart.
- [ ] Pair with `federation.agents.list` and `federation.agents.ask` granted to the first Unit.
- [ ] As admin on the first Unit, in the `chat` domain, ask "which agents do my paired Units have?": `list_peer_agents` lists the exposed domains only.
- [ ] Ask a question through `ask_peer_agent`; the answer is attributed to the other Unit.
- [ ] The other Unit shows a `Federation · <unit1>` conversation for the acting user.
- [ ] Federation tools are not offered to non-admin users, in `sales`/`openworld`, or when there is no active peer.
- [ ] Asking an agent that is not exposed returns "not found"; a public domain is never listed even if configured.
- [ ] Revoking only `federation.agents.ask` (re-pair without it) makes `ask_peer_agent` fail without a network call.
- [ ] `GET /api/v1/peers/:id/audit` on both Units shows inbound/outbound rows without question or answer text.
- [ ] More than 20 asks in 10 minutes from one peer return `429`.
- [ ] After revoking the pairing, the tools no longer list that Unit and calls fail.
