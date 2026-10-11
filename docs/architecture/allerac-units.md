# Allerac Units

## Status

Long-term architecture direction. This is not an implementation commitment for the
current release cycle.

The current priority remains stabilizing Control API v1 inside the existing app
container. Units should guide decisions about identity, agents, memory, and policy,
not force a premature multi-tenant rewrite.

This document describes what happens **inside** one Allerac deployment. The
companion document, [Allerac Federation](allerac-federation.md), describes what
happens **between** deployments.

Statements about the current system reference real code and migrations. Everything
else is a proposal and is marked as direction.

## Thesis

An Allerac deployment can evolve from a single-owner private assistant into a
**Unit**: one Allerac instance that hosts many people and many agents under one
operator, one policy, and one data boundary.

The target scenario is a company that runs Allerac for its employees. Each
employee has several agents running — a personal assistant, a code agent, a
ticket triage agent, a writing agent — and some agents belong to teams or to the
company itself, including public-facing agents on company websites.

```text
Allerac Unit
  One Allerac instance (deployment) that hosts people, teams, and agents
  under one operator, one policy, and one data boundary.

Allerac Federation
  The connection between Units: unit-to-unit cooperation through
  Control API contracts, events, identity, and capabilities.
```

Inside a Unit, isolation is **logical**: one database, one worker pool, one
executor service, enforced boundaries in services, tools, memory retrieval, and
workspaces. Between Units, isolation is **physical**: separate runtimes and
databases that cooperate only through contracts.

## Why This Matters

Allerac already hosts more than one person and more than one agent:

- admins and domain users share one installation (`users.is_admin`,
  `user_domain_access`, migration `034_multi_tenancy.sql`);
- admins invite people into a domain (`invite_tokens`,
  `src/app/actions/invites.ts`);
- background agent runs execute in the `agent-worker` container through
  `agent_runs` and `agent_workers`;
- skills define personas and tool allowlists (`skills`, `skill_tools`,
  `domain_skill_defaults`);
- public-facing agents serve website visitors (`sales`, `openworld` in
  `PUBLIC_DOMAINS`, `src/app/services/chat/chat-tool-registry.ts`);
- per-user Telegram bots carry their own skills (`telegram_bot_configs`,
  `telegram_bot_skills`).

The user model was designed for "a small number of trusted people sharing one
installation" ([Users](../users/README.md)). A company deployment breaks those
assumptions:

- the operator is not the owner of every person's data;
- people run several agents at once, in the background, on schedules;
- agents act on external systems — email, GitHub, social publishing, shell;
- agents need to cooperate with other people's and teams' agents;
- cost and capacity must be attributable to a person, a team, and an agent;
- public agents are reachable by anonymous callers.

Without an explicit Unit model, each of those pressures gets answered locally — a
flag here, a domain check there. The Unit model gives them one vocabulary:
principals, grants, scopes, memory visibility, call policy, approval gates, and
budgets.

## Core Concepts

### Unit

A Unit is one Allerac deployment: a Docker Compose stack, a VM, or a cloud
environment with its own Postgres database, `agent-worker`, executor, and Control
API.

A Unit is the largest boundary that shares a database. Everything inside a Unit is
separated logically; anything that needs physical separation becomes a different
Unit.

Today every Allerac installation is already a Unit with one operator and a small
number of members. The direction is to make that explicit and safe for many
members and many agents.

### Specialized Unit

A specialized Unit is a Unit focused on one domain, workload, or trust boundary.
The [Allerac Federation](allerac-federation.md) document calls these *isolated
domain cells*: a `health` Unit that never publishes raw records, a `code` Unit with
repository tooling, or a short-lived `sandbox` Unit for untrusted execution.

A specialized Unit uses the same model described here. It simply hosts fewer
people, fewer agents, and a narrower capability surface.

### Principal

A principal is anything that can act inside a Unit:

| Principal | Today | Direction |
|---|---|---|
| Human member | `users` row with a session or API key | unchanged, gains team membership and Unit role |
| Agent | implicit: a skill plus a run executed as its user | first-class `agent` identity with an owner |
| Service account | dedicated non-admin user for a public domain | a `public` or `service` agent owned by a team or the Unit |
| External client | `control_api_keys` bearer key tied to a user | key may be bound to a specific agent |
| Peer Unit | — | federation identity, see [Allerac Federation](allerac-federation.md) |

### Agent

An agent is a named, durable identity that does work on behalf of an owner.

Today an "agent" is not a stored entity. It is the combination of a user, a skill
(`agent_runs.skill_id`), a domain (`agent_runs.domain_slug`), and a model
(`llm_model`, `llm_provider`) on a single run. The worker loads the run owner's
settings (`WorkerRunRepository.getUserSettings(run.user_id)` in
`src/app/services/agents/worker-runner.service.ts`) and executes as that user.

Direction: an agent becomes a first-class record with an owner, a persona, a set of
grants, a memory policy, a call policy, and a budget. See
[Agent Identity](#agent-identity).

### Team

A team is a group of members inside a Unit. Teams own shared agents, shared
knowledge, shared budgets, and approval routing. Teams do not exist today.

### Grant

A grant is an explicit permission given to a principal: a domain, a tool, an API
scope, a knowledge source, a credential, or a callable agent. Grants are allowlists.
Missing configuration means no access.

### Agent Run

`agent_runs` remain the durable work contract inside a Unit, exactly as they are the
durable work contract across the federation. Every unit of agent work — human-started,
scheduled, or delegated by another agent — is an agent run with an identity, a
caller, a status, progress, artifacts, and a result.

## Target Shape

```text
Allerac Unit  (one deployment, one database)
  |
  +-- Unit policy
  |     approval gates · call policy defaults · budgets · retention
  |
  +-- Organization
  |     unit admins · teams · members
  |
  +-- Agents
  |     personal agents (owned by a member)
  |     team agents     (owned by a team)
  |     service agents  (owned by the Unit: sustain, triage, release)
  |     public agents   (website / anonymous callers)
  |
  +-- Shared runtime
        Control API · agent-worker · executor · Postgres · Ollama · providers
```

Example:

```text
acme Unit
  team: platform
    member: ana
      agent: ana-assistant      (chat, notes, email read)
      agent: ana-code           (code domain, shell, GitHub — PR open needs approval)
    member: bruno
      agent: bruno-assistant
    agent: platform-triage      (team-owned, tickets domain)
  team: sales
    agent: website-sales        (public, text-only, no personal context)
  unit agents
    agent: sustain-agent        (operations, raises tickets)
```

Every agent run, tool call, memory publication, and approval is attributable to a
principal path:

```text
unit: acme
  team: platform
    owner: ana
      agent: ana-code
        run: 7f3c...   caller: ana (human)
          run: 91ab... caller: ana-code -> platform-triage (delegated)
```

## Design Principles

- A Unit must keep working as a single-owner deployment; multi-member features are
  additive.
- An agent never has more permissions than its owner. Effective permission is the
  intersection of owner, agent, domain, and Unit policy.
- Isolation inside a Unit is logical and must be enforced by server code, not by
  prompts.
- Grants are explicit allowlists; missing configuration means no access.
- Every piece of agent work is a durable `agent_run` with a caller and an audit trail.
- Agents collaborate through `agent_runs`, never through shared prompts, shared
  conversations, or each other's private memory.
- Memory is private by default; sharing is an explicit publication.
- Sensitive and externally visible actions pass through approval gates the Unit can
  configure.
- Cost, capacity, and logs are attributable to unit, team, owner, and agent.
- When logical isolation is not enough, use a different Unit, not a stronger flag.
- Do not rename stable technical identifiers (`memory` slug, `/api/v1/memories`,
  table names) to match new product vocabulary.

## Agent Identity

### Today

| Aspect | Current implementation |
|---|---|
| Identity | none; runs belong to `agent_runs.user_id` |
| Persona | `skills.content` (system skills from `skills/*.md`, synced by `src/app/services/skills/system-skills-loader.ts`) |
| Tools | `skill_tools` allowlist plus domain rules in `resolveChatTools()` |
| Domain | `agent_runs.domain_slug`, `domain_skill_defaults` |
| Model | `agent_runs.llm_model`, `llm_provider`, `user_domain_model_settings` |
| Credentials | owner's `user_settings` provider keys, loaded by the worker |
| Continuations | `agent_runs.parent_run_id` (migration `095_agent_run_continuations.sql`) |
| External access | `control_api_keys` scopes per user (`src/app/services/api-keys/api-key.service.ts`) |

### Direction

Introduce an agent record. Shape for discussion, not a migration:

```text
agent
  id · slug (unique per Unit) · display_name · kind
  owner          member | team | unit
  persona        skill_id + agent-specific instructions
  domains        allowed domain slugs
  tools          allowlist of tool names
  api scopes     allowlist of Control API scopes
  knowledge      allowed knowledge sources and memory visibility
  call policy    which agents/principals may call it, which it may call
  approvals      per-action overrides, never weaker than Unit policy
  budget         per-period cost and concurrency limits
  credentials    explicit bindings (owner, team, unit, or Bridge capability)
  status         active · paused · retired
```

Kinds:

| Kind | Owner | Typical use |
|---|---|---|
| `personal` | member | assistant, code helper, writing agent |
| `team` | team | triage, docs maintainer, release validator |
| `service` | unit | sustain agent, system skill sync, monitors |
| `public` | team or unit | website sales or FAQ agent |

### Permission Rule

```text
effective(agent) =
    owner permissions
  ∩ agent grants
  ∩ domain policy
  ∩ unit policy
```

Consequences:

- removing a member's domain access removes it from all of that member's agents;
- disabling a member (`users.is_active = false`) pauses that member's agents;
- an admin-owned agent does not inherit admin powers unless they are granted to the
  agent explicitly;
- a team agent's owner permissions are the team's grants, not the union of members'
  grants;
- an API key bound to an agent can never exceed that agent's effective permissions.

This is the same intersection model already adopted for public domains in
[Public domain isolation review](../domains/public-domain-isolation-review.md):
principal, API scope, domain policy, and capability allowlist, each enforced
independently.

## Agent Workspace

### Today

The executor is a shared service (`executor` in `docker-compose.yml`, built from
`infra/executor`). Workspace paths are scoped per user under
`/workspace/projects/<userId>` (`getUserWorkspaceRoot()` and
`resolveUserWorkspacePath()` in `src/app/lib/workspace-paths.ts`).

### Direction

Per-agent workspaces are the continuation of the ongoing executor hardening work.
The direction:

- each agent gets its own workspace root inside its owner's workspace, for example
  `/workspace/projects/<userId>/agents/<agentId>`;
- executor requests carry the agent identity and run id, not only the user;
- the executor resolves paths against the agent root and rejects anything outside it;
- credentials needed for execution are injected per run with the narrowest scope,
  never shared through the workspace;
- shell and repository access are grants on the agent, not implicit capabilities of
  a domain;
- workspace retention follows the agent lifecycle (pause keeps, retire archives or
  deletes);
- risky or untrusted execution escalates to a `sandbox` specialized Unit (federation
  Stage 4) instead of widening the shared executor.

The shared executor remains acceptable for trusted, owner-approved work. It is not
the boundary for untrusted code.

## Memory Model

Unit memory reuses the federation model — local, published, index — one level down.

```text
Agent-private memory
  Working memory of one agent. Visible to the agent and its owner.

Owner memory
  The member's memory across their agents. Today's default:
  conversation_summaries scoped by user_id + domain_slug.

Published memory
  Curated summaries explicitly published to a team or to the Unit.

Memory index
  The Knowledge layer tracks where relevant memories live
  (source_type, source_id) without copying them.
```

Visibility levels:

| Visibility | Readable by | Written by |
|---|---|---|
| `agent` | the agent, its owner | the agent |
| `owner` | the owner, the owner's agents (by grant) | the owner, the owner's agents |
| `team` | team members and team agents (by grant) | explicit publication |
| `unit` | all members and agents with the grant | explicit publication |
| `federation` | trusted peer Units | explicit publication, see [Allerac Federation](allerac-federation.md) |

### Today

- Memories are `conversation_summaries` scoped by `user_id` and `domain_slug`
  (migration `037_domain_scoped_memory.sql`).
- Documents and RAG are scoped by `uploaded_by` and `domain_slug`.
- `skills.memory_scope` (`user`, `bot`, `global`) exists in the schema
  (`006_skills_system.sql`) but is not used as a retrieval boundary.
- The Knowledge roadmap requires every node and edge to be scoped to a user and
  every relationship to carry provenance ([Knowledge](../roadmap/knowledge.md)).

### Direction

- Add a visibility and an optional `agent_id` to memory sources rather than creating
  a parallel memory table.
- Publication creates a curated summary with provenance; it never exposes the raw
  conversation, note, or document.
- The Knowledge graph projection filters by principal and visibility at every
  retrieval stage, as it already filters by user and domain.
- Unit admins do not read members' `agent` or `owner` memory by default.
- Deleting a source or retiring an agent invalidates projections and published
  copies derived from it.

Example:

```text
ana-code (agent memory)
  "Repo X uses pnpm workspaces; tests run with turbo."

ana (owner memory)
  "Ana prefers small PRs with a short summary."

platform team (published)
  "Release branch is development; main is production."
```

## Agent Collaboration

### Today

- Runs are created through `POST /api/v1/agent-runs` (`agents:write`) and
  `/api/agents`.
- A run may continue a previous run of the same user through `parent_run_id`
  (`src/app/api/agents/route.ts` checks `getRunForUser(parentRunId, userId)`).
- The orchestrator can split one run into `agent_workers`, each with a task and
  optional skill, when `AGENT_ORCHESTRATION=true`.
- There is no agent-to-agent call across owners.

### Direction

Agent-to-agent collaboration is a delegated agent run:

```text
caller agent
  creates agent_run (callee, input, budget, deadline)
        |
        v
call policy check  -->  denied: run rejected, audited
        |
        v
callee agent executes with its own grants, not the caller's
        |
        v
result + artifacts returned to the caller run
```

Run attribution to add, for discussion:

```text
agent_runs
  agent_id          the agent doing the work
  caller_type       human | agent | schedule | api_key | peer_unit
  caller_id
  root_run_id       first run of the chain
  parent_run_id     existing column, generalized from continuations to delegation
  depth             delegation depth, bounded by Unit policy
```

Call policy defaults:

| Caller | May call |
|---|---|
| a member | their own agents; team agents of their teams |
| a personal agent | other agents of the same owner; team agents that allow it |
| a team agent | agents of the same team; service agents that allow it |
| a public agent | nothing, unless an explicit allowlist exists |
| a peer Unit | only exported capabilities, see federation |

Rules:

- the callee runs with its own effective permissions; delegation never transfers the
  caller's grants;
- the callee never reads the caller's private memory; it receives only the run input;
- budgets and deadlines propagate down the chain and cannot grow;
- delegation depth and fan-out are bounded;
- every delegation, refusal, and result is recorded in an audit trail
  (`agent_run_events`, mirroring `ticket_events` from `041_tickets.sql`).

## Approval Gates

Some actions must not be executed by an agent alone.

### Today

- Skill prompt edits proposed by the skill assistant are rendered as a diff and
  never auto-applied (`src/app/api/domains/skill-chat/route.ts`).
- The logs tool is gated by admin status (`buildLogsTool(user.is_admin)` in
  `src/app/services/chat/chat-tool-runner.ts`).
- Email send (`send_email`), social publishing (`instagram_publish_post`), and
  repository actions (`github_create_pr`) execute directly once the tool is resolved
  for the skill and domain; there is no generic approval step.

### Direction

Classify actions and let the Unit set a policy per class:

| Action class | Examples | Default |
|---|---|---|
| read | search, list emails, read tickets | auto |
| internal write | notes, memories, tickets | auto |
| external visible | `send_email`, `instagram_publish_post`, `github_create_pr` | owner approval |
| code execution | `execute_shell`, repository write | owner approval or deny |
| irreversible / destructive | delete data, merge, payments | admin approval or deny |

- Policies are configurable per Unit, and can only be made stricter per team or per
  agent.
- A run that hits a gate pauses in a durable state (for example
  `awaiting_approval`) instead of blocking a worker slot.
- Approvals are attributable: who approved, what exact payload, when.
- An approval covers the exact action shown, not a class of future actions.
- Approval requests reach the owner through the UI, Telegram, or the Control API.

## Organization Model

| Concept | Today | Direction |
|---|---|---|
| Unit | one deployment and database | same, plus Unit policy and settings |
| Operator | `users.is_admin` (all domains, configuration, `/admin`) | split: Unit operator (runtime, settings) and organization admin (members, teams) |
| Member | `users`, `is_active` | same, plus Unit role |
| Domain access | `user_domain_access`, `requireDomainAccess()` | same, plus grants via teams |
| Invite | `invite_tokens` (email, `domain_slug`, `issue_api_key`) | invite into teams with a role and initial domains |
| Team | — | `teams`, `team_members` |
| Agent | implicit (skill + run) | `agents` with owner and grants |
| Service account | dedicated non-admin user per public domain | `public` or `service` agent |
| API key | `control_api_keys` (`user_id`, `scopes`) | optional `agent_id`; scopes bounded by the agent |
| Identity provider | session auth, Google sign-in, OIDC provider (`src/app/services/oidc`) | external SSO for company Units; federation tokens later |

Two current behaviors need explicit decisions before a company Unit:

- `is_admin` bypasses domain checks and implies access to all members' domain data.
  In a company Unit, operating the runtime and reading people's data should be
  separate powers.
- Credentials live in per-user `user_settings` and in system settings. Team and Unit
  credentials need explicit bindings, preferably through capability gateways such as
  [Allerac Bridge](allerac-bridge.md).

## Public-Facing Agents

Public agents are the special case where the caller is anonymous.

### Today

- `PUBLIC_DOMAINS = ['sales', 'openworld']` in
  `src/app/services/chat/chat-tool-registry.ts` withholds personal memory, notes,
  scheduling, and instruction tools; `sales` is text-only.
- Each public domain is reached by a dedicated, non-admin service account through a
  website proxy ([How to expose an Allerac agent](../domains/expose-agent-to-website.md)).
- Per-domain limits and alerts live in `domain_rate_limit_settings`
  (migration `129_domain_rate_limit_settings.sql`); usage and cost are summarized by
  `src/app/services/domains/external-agent-metrics.service.ts`.
- The isolation model and remaining checks are recorded in
  [Public domain isolation review](../domains/public-domain-isolation-review.md).

### Direction

- A public agent is an agent of kind `public`, owned by a team or the Unit, never by
  a person's personal identity.
- It has no owner-inherited context: no personal memory, notes, email, or
  credentials.
- Knowledge sources are an explicit allowlist (product docs, FAQ), published at
  `unit` or `team` visibility.
- It cannot call other agents unless an explicit allowlist exists, and anything it
  triggers (lead capture, ticket creation) is a typed capability.
- Its budget and rate limits are separate from members' budgets.
- High-exposure public agents may later move to a dedicated `public` specialized
  Unit so the anonymous surface does not share a database with employee data.

## Quotas and Cost

### Today

- Credits per user: `credit_accounts`, `usage_reservations`, `credit_ledger`,
  `usage_pricing` (migration `069_credits_system.sql`,
  `src/app/services/credits/credit.service.ts`).
- Token usage: `tokens_usage`; per-worker `agent_workers.tokens_used`.
- Concurrency: one global limit for the worker (`AGENT_WORKER_MAX_CONCURRENT`).
- Rate limits: `src/app/lib/operation-limiter.ts` per account, plus per-domain caps
  for public domains.

### Direction

- Attribute every charge to unit, team, owner, agent, and run
  (`credit_ledger.reference_type` / `reference_id` already allow run references).
- Budgets at three levels: Unit, team, agent. A run must fit all of them.
- Per-agent concurrency limits so one agent cannot exhaust the shared worker.
- Delegated runs consume the budget passed by the caller, not a fresh budget.
- Local-only models (`user_domain_model_settings.local_only`) remain a cost and
  privacy control per domain and can become a per-agent setting.

## Observability

### Today

- Agent run state, heartbeats, and progress live in `agent_runs` and
  `agent_workers` (`progress_log`, `last_heartbeat`).
- The worker forwards `[Context]` log lines to the app's /logs UI
  (`POST /api/log-submit`).
- Optional Prometheus, Grafana, Loki, and Promtail run under the `monitoring` profile
  ([Monitoring](../monitoring/README.md)).

### Direction

- Label runs, logs, and metrics with unit, team, owner, and agent.
- Separate the **audit log** (who did what, approvals, delegations, publications)
  from **debug logs**.
- Give owners a per-agent view: runs, tool calls, approvals, cost, failures.
- Give Unit admins aggregated health and cost without exposing private content.
- Keep log content subject to the same visibility rules as memory.

## Trust Boundaries

Inside a Unit, principals share a database, a worker pool, an executor, and
possibly model credentials. Boundaries are logical and must be enforced at each of
these layers:

- Control API: authentication, scopes, ownership;
- service queries: principal and visibility filters;
- tool resolution: agent grants and domain policy;
- executor: agent workspace roots and per-run credentials;
- memory and Knowledge retrieval: visibility at every stage;
- approval gates: policy before externally visible actions;
- budgets: limits before execution starts.

Each Unit should define:

- which principals exist and who administers them;
- which approval policies apply per action class;
- which agents may call which agents;
- which memories may be published to teams, the Unit, or the federation;
- how logs, artifacts, and workspaces are retained;
- how credentials are bound and rotated;
- when a workload must move to a specialized Unit.

The rule for moving to a specialized Unit: when a workload needs a different
database, different secrets, different network exposure, or execution of untrusted
code, it is not a logical boundary anymore.

## Stages

Units evolve on a different axis than federation. Federation stages describe how
many runtimes exist and how they are split. Unit stages describe how many people
and agents one runtime can safely host.

### Stage U0: Single-Owner Unit

Today's default deployment. One operator (admin), a few trusted members, domain
users, public service accounts, and background agent runs that execute as their
user.

```text
admin + domain users + implicit agents (skill + run)
```

This remains the default developer and personal deployment model.

### Stage U1: First-Class Agents

- agent records with owner, persona, grants, and status;
- `agent_runs` attributed to an agent and a caller;
- per-agent workspaces in the executor;
- API keys optionally bound to an agent;
- personal agents only; no teams yet.

### Stage U2: Organization

- teams, team membership, Unit roles;
- operator and organization admin separated from data access;
- invites into teams;
- memory visibility (`agent`, `owner`, `team`, `unit`) and publication;
- Unit approval policies and per-agent budgets.

### Stage U3: Collaborating Agents

- delegated agent runs across owners and teams;
- call policies, delegation depth, budget propagation;
- audit trail for delegations and approvals;
- public agents as a governed kind.

### Stage U4: Federated Units

- Units expose selected agents and capabilities to peer Units;
- published memory and memory index across Units;
- federation identity and tokens;
- specialized Units (health, code, sandbox, public) next to a company's main Unit.

### Relationship To The Federation Stages

| Federation stage | Unit view |
|---|---|
| Stage 1: Single Runtime | one Unit, Stage U0 |
| Stage 2: Process Separation | one Unit with separated processes (`agent-worker` today); U1–U3 happen here |
| Stage 3: Domain Cells | specialized Units cooperating with a main Unit; requires U1 identity |
| Stage 4: Ephemeral Cells | short-lived specialized Units (sandbox) used by agents for untrusted work |

Stages U1–U3 do not require federation. Federation beyond Stage 2 should not start
before agent identity (U1) is stable, because cross-Unit calls need a principal to
attribute work to.

## What Not To Do Yet

Do not create a database or schema per tenant. A Unit is the tenant boundary;
use another Unit when physical isolation is required.

Do not adopt a general policy engine or policy language before the grant model
is stable in code.

Do not rename stable identifiers (`users`, `agent_runs`, `memory` slug,
`/api/v1/memories`) to match Unit vocabulary.

Do not let agents create, modify, or grant permissions to other agents without a
human principal.

Do not let agents talk to each other outside durable `agent_runs`.

Do not treat prompts as authorization. Personas describe behavior; server code
enforces boundaries.

Do not give unit admins default read access to members' private agent memory.

Do not make multi-member features mandatory for a single-owner installation.

Do not federate Units before intra-Unit identity and call policy exist.

## Near-Term Implications

The Unit direction supports the current roadmap:

- finish Control API v1; the deferred `POST /api/v1/tools/:name/run` should wait for
  the agent grant model described here, because it is the explicit tool permission
  model that endpoint is waiting for;
- keep representing background work as `agent_runs`; when changing the table,
  prefer additive columns (agent, caller, root run) over new work tables;
- strengthen API key scopes; agent-bound keys and Unit admin scopes are the concrete
  use cases the scope list said to wait for;
- continue executor hardening toward per-agent workspaces and per-run credentials;
- complete the public domain isolation checks; they are the first implementation of
  the intersection permission rule;
- keep Knowledge contracts (`IntelligenceNode`, `IntelligenceEdge`) ready to carry
  visibility and agent provenance;
- attribute credits and token usage to runs so per-agent budgets are possible later;
- keep the single-owner deployment healthy.

A first ADR could record the agent identity decision (agents as first-class
principals bounded by their owner) once the open questions below are settled.

## Open Questions

- Is an agent a separate table, or a specialized `users` row (`kind = agent`) that
  reuses sessions, keys, and ownership checks?
- Can an agent be owned by a team from U1, or only by a member until U2?
- Should Unit admins be able to read members' private memory for compliance, and if
  so, how is that access audited?
- How should `is_admin` split into operator and organization admin without breaking
  single-owner installs?
- Which credentials belong to the Unit, the team, and the member, and can an agent
  use its owner's personal provider keys in a company Unit?
- Are approval gates synchronous (run waits) or asynchronous (run pauses and
  resumes), and through which channels?
- Is `parent_run_id` generalized to delegation, or does delegation get its own column?
- What is the default call policy between personal agents of different members?
- Should public agents live in the main Unit or in a dedicated public Unit by
  default?
- How are SSO and external identity providers introduced for company Units?
- What is the minimal audit log format shared by Units and the federation?

## Working Definition

An Allerac Unit is one Allerac deployment that hosts many people and many agents
under one operator, one policy, and one data boundary, where agents are first-class
identities bounded by their owners, work is represented as durable agent runs,
memory is private by default and shared only by publication, and sensitive actions
pass through configurable approval gates. Units cooperate with other Units through
[Allerac Federation](allerac-federation.md).
