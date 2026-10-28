# Federation Manifest

Every Allerac Unit serves a public manifest at `/.well-known/allerac` so other
Units can discover what it is before pairing. It implements roadmap phase P1 of
the [Federation Protocol](../roadmap/federation-protocol.md) (see also
[Allerac Federation](../architecture/allerac-federation.md#discovery)).

- No authentication, no database access.
- `Cache-Control: public, max-age=300`.
- Returns `404` when `ALLERAC_FEDERATION_MANIFEST=false`.
- Plain JSON (not wrapped in the Control API `data` envelope).

## Example

```json
{
  "allerac": "federation",
  "protocolVersion": "1",
  "unit": { "name": "napols", "displayName": "Napols", "url": "https://napols.example" },
  "software": { "name": "allerac-one", "release": "0.1.0" },
  "pairing": { "accepting": true },
  "capabilities": [
    { "id": "federation.manifest.read", "version": "1" },
    { "id": "federation.agents.list", "version": "1" },
    { "id": "federation.agents.ask", "version": "1" },
    { "id": "federation.runs.create", "version": "1" },
    { "id": "federation.runs.read", "version": "1" }
  ],
  "publicKey": null,
  "endpoints": { "api": "/api/v1" }
}
```

## What It Contains

Only Unit-level facts: name, display name, canonical URL, protocol version,
release, whether pairing is accepted, advertised federation capabilities, a
public key (a `null` placeholder for now), and the API base path.

It never lists users, domains, modules, tools, providers, models, internal hosts
or ports, or build commit details.

## Capabilities

Capabilities come from the typed registry in `src/federation/capabilities.ts`.
Each one maps to a [service principal](control-api-v1/service-principals.md)
scope:

| Capability | Service scope |
|---|---|
| `federation.manifest.read` | `federation:manifest:read` |
| `federation.agents.list` | `federation:agents:list` |
| `federation.agents.ask` | `federation:agents:ask` |
| `federation.runs.create` | `federation:runs:create` |
| `federation.runs.read` | `federation:runs:read` |

Capabilities tied to an optional module are only advertised when that module is
enabled. Advertising a capability does not grant it: access still requires
pairing and a scoped service key.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ALLERAC_FEDERATION_MANIFEST` | `true` | Serve the manifest (`false` → `404`) |
| `ALLERAC_UNIT_NAME` | `ALLERAC_UNIT`, then `allerac` | `unit.name` (lowercase slug) |
| `ALLERAC_UNIT_DISPLAY_NAME` | unit name | `unit.displayName` |
| `ALLERAC_PUBLIC_URL` | request origin | `unit.url` |
| `ALLERAC_PAIRING_ACCEPT` | `false` | Advertise that pairing is accepted |
| `ALLERAC_PAIRING_ACCEPT_PUBLIC` | `false` | Also required on public profiles (`openworld`, `sales`) |
| `ALLERAC_FEDERATION_CAPABILITIES` | all | Comma list narrowing advertised capability ids |
