# Allerac Federation

## Status

Long-term architecture direction. This is not an implementation commitment for the
current release cycle.

The current priority remains stabilizing Control API v1 inside the existing app
container. Federation should guide decisions, not force premature service splits.

This document describes cooperation **between** Allerac Units. What happens
**inside** one Unit — people, teams, agents, scoped memory, and approval gates — is
described in [Allerac Units](allerac-units.md).

## Thesis

Allerac One can evolve from a single application into a federated operating system
for specialized AI domains.

In this model, an Allerac deployment — an **Allerac Unit** — is not only a web app.
It is a complete, isolated runtime that can expose capabilities, run agents, own
data, and cooperate with other Allerac runtimes through stable contracts.

```text
Allerac Federation
  A network of autonomous Allerac Units
  connected through APIs, events, identity, policy, and shared protocols.

Allerac Unit
  One Allerac instance (deployment) that hosts people and agents.

Isolated Domain Cell
  A specialized Unit focused on a domain, workload, or trust boundary.
```

## Why This Matters

The current monolithic deployment is useful because it keeps development and
operations simple. But the product direction points toward workloads with different
requirements:

- support and ticket operations;
- code execution and repository work;
- documentation and architecture maintenance;
- personal health and finance data;
- social publishing workflows;
- sandboxed agent execution;
- customer-specific or team-specific deployments.

Those workloads should not all require the same dependencies, permissions, runtime
shape, or operational risk. Federation gives Allerac a path to isolate domains while
keeping them interoperable.

## Core Concepts

### Federation

A federation is a group of Allerac Units that can discover each other, exchange
work, and share selected context without sharing one database.

Each Unit keeps its own runtime and data boundary. Cooperation happens through
versioned APIs and events.

### Isolated Domain Cell

A domain cell is a specialized Allerac Unit: an isolated runtime focused on a domain
or workload. It may run as a Docker Compose stack, a VM deployment, a cloud service,
or an ephemeral sandbox. It follows the same Unit model — principals, agents,
grants, scoped memory — with a narrower capability surface
(see [Allerac Units](allerac-units.md)).

Throughout this document, *cell* is shorthand for a specialized Unit, and the
*home cell* is the main Unit that people use day to day.

Examples:

| Cell | Purpose |
|---|---|
| `home` | User entry point, identity, routing, preferences, memory index |
| `tickets` | Support workflows, ticket triage, resolution, event history |
| `docs` | Documentation, ADRs, roadmap, architecture review |
| `code` | Repository work, tests, builds, pull request automation |
| `finance` | Watchlists, financial signals, alerts, reports |
| `health` | Health logs, habit tracking, personal metrics |
| `sandbox` | Short-lived isolated execution for risky or specialized tasks |

### Capability

A capability is a documented action or resource a cell exposes. Capabilities should
be explicit and typed, not inferred from arbitrary internal routes.

Examples:

```text
tickets.create
tickets.resolve
docs.propose_change
code.run_tests
code.review_pull_request
sandbox.run_agent
finance.create_alert
```

### Agent Run

`agent_runs` are the durable work contract inside a Unit and become the durable
work contract across the federation. A cell may create, accept, execute, delegate,
cancel, or report progress on an agent run.

The important property is that work is represented as durable state, not only as an
in-process function call.

## Target Shape

```text
Clients
  Browser UI · CLI · Bruno · Telegram · automations
        |
        v
Home Allerac Cell
  identity · preferences · routing · policy · memory index
        |
        +--> Tickets Cell
        +--> Docs Cell
        +--> Code Cell
        +--> Finance Cell
        +--> Health Cell
        +--> Sandbox Cell
```

Each cell can run a complete Allerac runtime:

```text
Cell
  Control API
  local services
  agent workers
  local database
  optional domain integrations
```

Cells communicate through contracts:

```text
Control API v1+
  resources · scopes · ownership · response envelopes

Events
  work accepted · run completed · artifact produced · memory published

Identity
  users · service identities · scoped API keys · future federation tokens

Artifacts
  logs · patches · screenshots · reports · generated files
```

## Design Principles

- A cell must be useful on its own.
- A cell must not require direct access to another cell's database.
- Cross-cell communication must use stable APIs or events.
- Work should be represented through durable resources, especially `agent_runs`.
- Domain-specific dependencies belong inside the domain cell.
- Isolation is a product feature, not only an infrastructure detail.
- Federation should remain optional; a single-node Allerac deployment must keep
  working.
- Do not split a cell out until the local contract is stable.

## Relationship To Control API v1

Control API v1 is the first practical step toward federation.

Today:

```text
Browser UI / Bruno
      |
      v
Single app container
      |
      v
/api/v1 resources
```

Federated future:

```text
Cell A
  /api/v1 resources
      |
      v
Cell B
  /api/v1 resources
```

The Control API gives all clients and cells the same language:

- stable resource contracts;
- scoped authentication;
- ownership checks;
- predictable JSON envelopes;
- durable agent run state;
- integration-friendly documentation and OpenAPI.

This is why API work should remain boring, typed, and conservative. The contracts
are not only for the current UI; they are the future federation protocol.

## Deployment Model

Federation can evolve through stages.

### Stage 1: Single Runtime

The current app container owns UI, Control API, services, and most execution.

```text
app + db + executor + docs + monitoring
```

This remains the default developer and small deployment model.

### Stage 2: Process Separation

Move long-running execution into explicit workers while keeping one product
deployment.

```text
web
api
agent-worker
executor
db
```

This stage prepares the codebase for clearer responsibility boundaries.

Stages 1 and 2 describe one Unit. A Unit can grow from a single owner to many
members and agents without leaving these stages; see the Unit stages in
[Allerac Units](allerac-units.md#stages).

### Stage 3: Domain Cells

Run selected domains as isolated deployments with their own database and workers.

```text
home cell
tickets cell
docs cell
code cell
```

Each domain cell is a specialized Unit. The home cell can route work to specialized
cells using Control API contracts.

### Stage 4: Ephemeral Cells

Create short-lived cells for risky, expensive, or highly specialized work.

Examples:

- execute untrusted generated code;
- run browser tests;
- validate migrations against disposable data;
- clone and analyze repositories;
- build temporary agent environments.

This is where Azure-style sandbox environments may become useful. The important
architectural rule is that a sandbox is an execution backend for a cell or worker,
not the center of the platform.

## Trust Boundaries

Federation introduces stronger trust requirements.

Each cell should define:

- what identities may call it;
- which scopes are accepted;
- which domains and resources are exposed;
- whether it can initiate outbound calls to other cells;
- what data may leave the cell;
- how logs and artifacts are retained;
- how secrets are injected and rotated.

Sensitive cells, such as health or finance, may choose not to publish memories or
raw records to the federation. They can expose only derived outputs or explicit
capabilities.

## Memory Model

Federated memory should not mean one global table of all memories.

Recommended model:

```text
Local memory
  Full memory owned by each cell.

Published memory
  Curated summaries a cell explicitly makes available to trusted cells.

Memory index
  Home cell tracks where relevant memories live without copying everything.
```

This keeps sensitive domains isolated while still allowing continuity.

Inside a Unit, the same model applies one level down: agent-private, owner, team,
and Unit visibility, with explicit publication (see
[Allerac Units](allerac-units.md#memory-model)).

Example:

```text
health cell
  private detailed health logs
  publishes: "User prefers concise coaching and weekly summaries."

docs cell
  private architecture notes
  publishes: "Current platform direction is Control API then federation."
```

## Unit Identity and Role

A Unit's *name* (santos, barcelona, napols) is its stable identity, used in
pairing. Its *role* (what it takes care of, a short description, per-agent
descriptions) is an admin-editable property in `unit_profile`. The Soul opens
with it, so the Unit's agents introduce themselves by name and role. Every
paired peer sees the role through the authenticated agents list; the
unauthenticated manifest does not. Public domains stay generic unless the admin
opts in. See roadmap P3.5.

## Agent Specialization

Federation makes agent specialization concrete.

Instead of one general worker with every dependency, cells can own specialized
agents:

| Agent | Cell | Typical work |
|---|---|---|
| `ticket-triage-agent` | tickets | classify, prioritize, assign, resolve |
| `docs-maintainer-agent` | docs | update docs, ADRs, roadmaps |
| `code-review-agent` | code | inspect diffs, run tests, produce review findings |
| `release-validator-agent` | operations/code | validate release candidates |
| `sandbox-agent` | sandbox | execute isolated code or experiments |

The shared contract is not the agent implementation. The shared contract is the
agent run input, progress, artifacts, and final result.

## What Not To Do Yet

Do not immediately split every domain into a separate deployment.

Do not introduce a complex service mesh before the API contract is stable.

Do not let cells call each other's databases.

Do not design federation around one cloud provider.

Do not make sandbox execution mandatory for normal local development.

## Near-Term Implications

The federation vision supports the current roadmap:

- finish Control API v1 resource contracts;
- keep API route handlers thin and service-backed;
- maintain OpenAPI and Bruno collections;
- strengthen API key scopes;
- represent background work as `agent_runs`;
- document deployment and rollback practices;
- identify which domains could become cells later;
- keep the single-node deployment healthy.

## Federation Protocol (Proposal)

This section proposes concrete answers to earlier open questions. It is a
proposal, not a committed contract. The implementation sequence lives in the
[Federation Protocol roadmap](../roadmap/federation-protocol.md).

### Transport

Units talk over HTTP through each other's Control API (`/api/v1`). Calls are
authenticated with scoped service keys exchanged at pairing. No Unit reads or
writes another Unit's database.

### Work Model

- **Long work** is a cross-unit `agent_run`: input, progress, artifacts, and
  result. The calling Unit creates the run on the target Unit and tracks it.
- **Completion** is delivered via a signed webhook (`run completed`) to the
  calling Unit, with polling of the run resource as a fallback.
- **Synchronous calls** are reserved for quick reads, such as capability lookup
  or status checks.

### Discovery

```text
LAN       mDNS / DNS-SD announcement of nearby Units
Internet  public manifest at /.well-known/allerac
Registry  optional simple registry, later
```

The `/.well-known/allerac` manifest describes the Unit: name, version,
federation protocol version, exposed capabilities, and public key. Internet
Units are added by URL, for example `unit1.allerac.ai` and `unit2.allerac.ai`
running on the same host behind the Cloudflare tunnel.

### Pairing

Discovery is not connection. Units connect through explicit pairing, similar to
Bluetooth:

1. Unit A sends a pairing request to Unit B.
2. An owner of Unit B accepts it in **Settings > Discovery**.
3. Both Units exchange scoped service keys that list the allowed capabilities
   and published-memory access.
4. Either side can revoke the pairing at any time.

Public Units (for example `openworld`) do not accept pairing by default.

### Identity

Minimum model now: one service identity per peer, with scoped keys. Federation
tokens can come later, once multiple hops or delegation are needed.

### Memory

Only published memories cross Unit boundaries. Local memory stays local (see
[Memory Model](#memory-model) and
[Allerac Units](allerac-units.md#memory-model)).

### Shared Hosts

Several Units may share one machine to reduce cost. Each keeps its own Compose
stack, database, and hostname, so the isolation boundary is unchanged.

### Federation Client and Tools

A single shared federation client module is the only code allowed to call other
Units. It:

- applies the pairing key for the target peer;
- enforces the scopes granted at pairing and denies anything not granted;
- signs requests;
- writes an audit log entry for every call.

Agent tools are built on this client:

| Tool | Purpose |
|---|---|
| `list_peer_agents` | List agents exposed by paired Units |
| `ask_peer_agent` | Quick synchronous question to a remote agent |
| `delegate_to_peer` | Create an `agent_run` on a peer for long work |

These tools are never exposed to public-domain bots, using the same mechanism as
the `PUBLIC_DOMAINS` restriction in `chat-tool-registry.ts`.

Inbound, requests from a peer arrive as authenticated service principals with
their own scopes, and pass the same policy checks as any other principal (see
[Allerac Units](allerac-units.md)).

### Unified Inbox

The home Unit offers a WhatsApp-like inbox listing agents from all paired Units,
local and remote, with one chat per agent. Messages to a remote agent are relayed
through the peer's `/api/v1` using the pairing key. Each Unit keeps ownership of
its agent's data and memory; the home Unit only shows the conversation.

Implemented in P4a: the home Unit keeps a local mirror of remote threads in
`federated_threads` / `federated_messages`, separate from `chat_conversations`, so
remote text never reaches local memory, RAG, or search. The peer keeps federated
conversations in its chat history tagged `source='federation'`, excluded from
long-term memory extraction. Remote replies are untrusted text, rendered as plain
text and never fed to local tools. See
[Unified Inbox](../roadmap/federation-unified-inbox.md).

Telegram, the core notification channel, can act as an optional mobile inbox: one
bot routes to any agent by command, for example `/openworld` or `/health`.

## Open Questions

Resolved by the [Federation Protocol (Proposal)](#federation-protocol-proposal):
identity baseline, discovery, sync vs. async calls, and which memories cross
Units. Still open:

- When are federation tokens needed beyond per-peer service keys?
- Which cells should be allowed to execute untrusted code?
- What is the artifact format for cross-cell agent work?
- How are webhook signing keys rotated, and how are capabilities versioned?
- Should a simple public registry exist, and who operates it?
- When does the `api` container split from the web UI?
- Which first cell should be separated from the monolith?

## Working Definition

Allerac Federation is the long-term architecture where multiple Allerac Units,
including specialized domain cells, cooperate through stable APIs, durable agent
runs, scoped identity, and explicit capability contracts while preserving local
ownership of data and runtime.
