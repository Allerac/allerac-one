# Federation Protocol Roadmap

## Status

Proposed. Implements the [Federation Protocol (Proposal)](../architecture/allerac-federation.md#federation-protocol-proposal).
Related: [Allerac Units](../architecture/allerac-units.md),
[Control API v1](control-api-v1.md).

Federation stays optional: a single-node deployment must keep working after every
phase.

## P0: Control API v1 Stability and Service Identity

**Goal:** a stable `/api/v1` that another Unit can call safely.

**Status:** implemented — see [Service Principals](../api/control-api-v1/service-principals.md).

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

**Status:** implemented — see [Federation Manifest](../api/federation-manifest.md).
The `publicKey` field is a `null` placeholder until signing keys exist.

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

**Status:** backend implemented (P2a) — see [Federation Pairing](../api/federation-pairing.md)
and [Peers](../api/control-api-v1/peers.md). Settings > Discovery UI (P2b)
implemented (admin-only tab). LAN mDNS discovery (P2c) is a follow-up.

## P3: Federation Client and Agent Tools

**Goal:** one secure path for all Unit-to-Unit calls.

**Deliverables**

- Shared federation client module: the only code allowed to call peers. Applies
  the pairing key, enforces granted scopes, signs requests, audit-logs every call,
  and denies anything not granted.
- Agent tools `list_peer_agents` and `ask_peer_agent` built on the client.
- Tools hidden from public-domain bots (same mechanism as `PUBLIC_DOMAINS` in
  `chat-tool-registry.ts`).
- Inbound peer requests handled as service principals with their own scopes.

**Acceptance criteria**

- No other module makes outbound calls to peers.
- A call outside the granted scopes is denied and logged.
- Public-domain bots cannot see or call federation tools.

**Status:** implemented — see [Federation Agents](../api/federation-agents.md).
Inbound calls are authenticated with the peer's scoped service key and every
call is audit-logged. Request signing moves to P5 together with
`delegate_to_peer`. Manual checks: [Federation Checklist](../operations/federation-pairing-checklist.md).

## P3.5: Unit Identity and Role

**Goal:** every Unit knows and tells who it is and what it takes care of.
Asked "who are you?", Barcelona answers "I'm Barcelona, I take care of my
documents", not a generic "Allerac".

**Deliverables**

- The Unit *name* (`ALLERAC_UNIT_NAME`: santos, barcelona, napols) stays the
  stable identity. The *role* is a changeable property stored in the singleton
  `unit_profile` table (migration 145): display name, emoji, role, description,
  tags, a short description per exposed agent, and the
  `identity_in_public_domains` toggle. Env fallbacks: `ALLERAC_UNIT_DISPLAY_NAME`,
  `ALLERAC_UNIT_ROLE`, `ALLERAC_UNIT_DESCRIPTION`, `ALLERAC_UNIT_IDENTITY_PUBLIC`.
- Admin-only "This Unit" card in Settings > Discovery, backed by
  `GET/PUT /api/v1/unit/profile` (session admin, like `/api/v1/peers`).
- The Soul (`buildSoul(domain, identity)`) opens with the Unit identity and role
  in chat, federated asks, and jobs. Public domains (`sales`, `openworld`) keep
  the generic public Soul unless the admin turns the toggle on.
- Paired peers get the role through `GET /api/v1/federation/agents` (new `unit`
  field, existing `federation:agents:list` scope, so existing pairings work).
  Agent `description` is filled from the admin's per-agent text. The public
  manifest is unchanged: it never carries the role.
- Discovery shows each active peer's role and agents
  (`GET /api/v1/peers/:id/profile`, live); `list_peer_agents` returns
  `displayName`, `role`, `description`, `tags` per Unit.

**Acceptance criteria**

- With a role set, the Unit introduces itself by name and role; without one it
  introduces itself by name (default: capitalized unit name).
- Public domains never mention the Unit unless the toggle is on.
- Units on older releases still list agents (`unit` is optional and ignored if malformed).

**Later:** binding skills, tools, or memory scopes to a role (see P6).

**Status:** implemented.

## P4: Unified Inbox and Telegram Routing

**Goal:** chat with any agent, local or remote, from the home Unit.

**Deliverables**

- WhatsApp-like inbox listing agents from all paired Units, one chat per agent.
- Messages to remote agents relayed through the peer's `/api/v1` with the
  pairing key; the peer keeps ownership of data and memory.
- Optional: one Telegram bot routing to any agent by command (e.g. `/openworld`,
  `/health`).

**Acceptance criteria**

- Remote agents appear next to local ones and can be chatted with.
- Unpairing a peer removes its agents from the inbox.
- Remote conversation data is stored on the owning Unit.

## Milestone 1: Two Connected Units

**P0–P4 together:** connect two Units and chat with a remote agent end to end.
Pair Unit A and Unit B, see B's agents in A's inbox, send a message, and get a
reply, with every call going through the federation client and audit log.

## P5: Cross-Unit Agent Runs and Signed Webhooks

**Goal:** delegate long work to a paired Unit.

**Deliverables**

- Create and track `agent_runs` on a peer (input, progress, artifacts, result).
- `delegate_to_peer` tool on top of the federation client.
- Signed `run completed` webhook to the caller, with polling fallback.

**Acceptance criteria**

- A run created on Unit B from Unit A completes and its result appears on Unit A.
- Unsigned or wrongly signed webhooks are rejected.
- With webhooks disabled, polling still delivers the result.

## P6: Published Memory and Home Memory Index

**Goal:** share curated context without sharing databases.

**Deliverables**

- Explicit "publish" state for memories, scoped per peer.
- Home Unit memory index that records where published memories live.

**Acceptance criteria**

- Unpublished memories are never returned to a peer.
- A peer sees only memories it was granted at pairing.

## P7: Multi-Unit Same-Host Deployment Tooling

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
