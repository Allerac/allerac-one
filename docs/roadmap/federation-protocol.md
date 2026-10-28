# Federation Protocol Roadmap

## Status

Proposed. Implements the [Federation Protocol (Proposal)](../architecture/allerac-federation.md#federation-protocol-proposal).
Related: [Allerac Units](../architecture/allerac-units.md),
[Control API v1](control-api-v1.md).

Federation stays optional: a single-node deployment must keep working after every
phase.

## P0: Control API v1 Stability and Service Identity

**Goal:** a stable `/api/v1` that another Unit can call safely.

**Deliverables**

- Control API v1 contracts frozen for the resources federation needs
  (`agent_runs`, memories, system).
- Service identities (non-human principals) and scoped service keys.
- OpenAPI and Bruno coverage for those resources.

**Acceptance criteria**

- A service key with limited scopes can call only the allowed endpoints.
- Service keys can be created, listed, and revoked via API and UI.

## P1: `/.well-known/allerac` Manifest and Capability Registry

**Goal:** a Unit can describe itself publicly.

**Deliverables**

- Public `/.well-known/allerac` manifest: unit name, version, federation protocol
  version, exposed capabilities, public key.
- Internal capability registry that is the single source for the manifest.

**Acceptance criteria**

- Manifest is reachable without authentication and validates against a schema.
- Capabilities shown in the manifest match the registry.

## P2: Peers, Pairing, and Settings Discovery UI

**Goal:** Units connect explicitly, like Bluetooth pairing.

**Deliverables**

- `peers` table (identity, URL, public key, granted capabilities, status).
- Pairing flow: request, accept/reject, exchange of scoped service keys, revoke.
- **Settings > Discovery** UI: add a Unit by URL; list LAN Units via mDNS/DNS-SD.
- Public Units default to not accepting pairing.

**Acceptance criteria**

- Two Units on different hostnames can pair and unpair from the UI.
- A revoked peer can no longer call the other Unit.
- LAN discovery lists Units but never auto-pairs.

## P3: Cross-Unit Agent Runs and Signed Webhooks

**Goal:** delegate long work to a paired Unit.

**Deliverables**

- Create and track `agent_runs` on a peer (input, progress, artifacts, result).
- Signed `run completed` webhook to the caller, with polling fallback.

**Acceptance criteria**

- A run created on Unit B from Unit A completes and its result appears on Unit A.
- Unsigned or wrongly signed webhooks are rejected.
- With webhooks disabled, polling still delivers the result.

## P4: Published Memory and Home Memory Index

**Goal:** share curated context without sharing databases.

**Deliverables**

- Explicit "publish" state for memories, scoped per peer.
- Home Unit memory index that records where published memories live.

**Acceptance criteria**

- Unpublished memories are never returned to a peer.
- A peer sees only memories it was granted at pairing.

## P5: Multi-Unit Same-Host Deployment Tooling

**Goal:** run several Units on one machine cheaply.

**Deliverables**

- `install.sh` / `update.sh` support for multiple Units, each with its own
  Compose stack, database, and hostname.
- Cloudflare tunnel hostname setup per Unit (e.g. `unit1.allerac.ai`,
  `unit2.allerac.ai`).

**Acceptance criteria**

- Two Units run on one host, update independently, and pair with each other.
- Stopping or restoring one Unit does not affect the other.

## Later: Ephemeral Cells

Short-lived Units for risky or specialized work (sandboxed execution, browser
tests, migration validation), created and paired automatically and destroyed
after the run.
