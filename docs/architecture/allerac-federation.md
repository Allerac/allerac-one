# Allerac Federation

## Status

Long-term architecture direction. This is not an implementation commitment for the
current release cycle.

The current priority remains stabilizing Control API v1 inside the existing app
container. Federation should guide decisions, not force premature service splits.

## Thesis

Allerac One can evolve from a single application into a federated operating system
for specialized AI domains.

In this model, an Allerac deployment is not only a web app. It is a complete,
isolated runtime that can expose capabilities, run agents, own data, and cooperate
with other Allerac runtimes through stable contracts.

```text
Allerac Federation
  A network of autonomous Allerac instances
  connected through APIs, events, identity, policy, and shared protocols.

Isolated Domain Cell
  One autonomous Allerac runtime focused on a domain, workload, or trust boundary.
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

A federation is a group of Allerac instances that can discover each other, exchange
work, and share selected context without sharing one database.

Each instance keeps its own runtime and data boundary. Cooperation happens through
versioned APIs and events.

### Isolated Domain Cell

A domain cell is an isolated Allerac runtime specialized for a domain or workload.
It may run as a Docker Compose stack, a VM deployment, a cloud service, or an
ephemeral sandbox.

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

`agent_runs` become the durable work contract across the federation. A cell may
create, accept, execute, delegate, cancel, or report progress on an agent run.

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

### Stage 3: Domain Cells

Run selected domains as isolated deployments with their own database and workers.

```text
home cell
tickets cell
docs cell
code cell
```

The home cell can route work to specialized cells using Control API contracts.

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

Example:

```text
health cell
  private detailed health logs
  publishes: "User prefers concise coaching and weekly summaries."

docs cell
  private architecture notes
  publishes: "Current platform direction is Control API then federation."
```

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

## Open Questions

- What is the minimum federation identity model?
- Should cells discover each other through configuration, registry, or DNS?
- Are cross-cell calls synchronous API calls, asynchronous events, or both?
- Which memories are publishable across cells?
- Which cells should be allowed to execute untrusted code?
- What is the artifact format for cross-cell agent work?
- When does the `api` container split from the web UI?
- Which first cell should be separated from the monolith?

## Working Definition

Allerac Federation is the long-term architecture where multiple isolated Allerac
domain cells cooperate through stable APIs, durable agent runs, scoped identity, and
explicit capability contracts while preserving local ownership of data and runtime.
