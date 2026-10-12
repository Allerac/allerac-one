# Sustain Agent — Production Monitoring and Maintenance

**Status:** Proposed

**Depends on:** Cloudflare Tunnel (already in use for cloud access), the tickets domain (`docs/domains/tickets.md`), multi-bot Telegram support (`telegram_bot_configs`), disaster-recovery tooling (`docs/database-backup-restore.md`)

**Enables:** Early detection of production problems without a human actively watching dashboards, and a maintenance-scoped agent role that keeps what already exists running — distinct from agents that plan or build new features.

## Objective

Give Allerac One a standing production monitor that notices when something is wrong, tells a human quickly, and — over time, as trust is earned — takes on more of the diagnosis and eventually some of the mitigation itself. The role is explicitly bounded to *sustaining*: keeping existing behavior working, not deciding what to build next.

## Why two detection tiers

An agent hosted on the infrastructure it watches cannot report on that infrastructure's own death — if the thing monitoring the VM lives on the VM, and the VM goes down, nothing sends the alert. This is worse under Allerac's cost-optimized deployment plan, where the cloud VM is normally *stopped* and only boots on demand — an agent that only lives there isn't running most of the time either.

| Tier | Runs where | Detects | Blind to |
|---|---|---|---|
| 1 — External health check | Cloudflare edge (outside home and VM) | Total outage — home and VM both unreachable | Anything internal that still returns a healthy response at the edge |
| 2 — Sustain agent | Home or VM, whichever is up | Anything internal while its own host is alive: a crash-looping container, a failed backup, disk pressure, a degraded dependency | Its own host dying |

Both tiers are required; neither substitutes for the other. Tier 1 must never depend on anything hosted inside Allerac's own infrastructure — that independence is the entire point of it.

## Pipeline

```
detection → alert → ticket creation → human review → (later) supervised mitigation → (much later) autonomous mitigation for proven problem classes
```

Phase 1 of this roadmap only builds as far as "ticket creation → human review." A human still opens the ticket and decides what to do — nothing acts on its own yet. Mitigation capability is grown deliberately, one phase at a time, once the detection and diagnosis layers underneath it are trusted.

## Scope: what "sustain" means

The agent's job is bounded on purpose, so it stays trustworthy as it's given more autonomy:

**In scope**
- Watch health signals and triage failures.
- Open tickets with a diagnosis attached (which container, what the health check reported, relevant log excerpt) — the same investigate-then-report pattern the `bug-hunter` skill already uses for code, aimed at infrastructure instead.
- Propose a specific remediation in the ticket.
- (Later phases) Execute a human-approved remediation from an allow-listed set of safe, reversible actions.
- Notice recurring failure patterns and surface them, rather than re-alerting on the same thing repeatedly without comment.

**Out of scope, permanently unless explicitly revisited**
- Planning or shipping new features or domains. A feature gap it notices becomes a ticket for a human (or a feature-focused agent) to triage — the sustain agent does not act on it.
- Any irreversible action without explicit human confirmation at the time: `disaster-restore`, schema drops, force-push, volume deletion, and anything else in that class. This mirrors the confirmation gates already built into `allerac.sh`.
- Architectural decisions.

## Detection sources

**Tier 1 (external):** A Cloudflare Health Check against the production URL/tunnel hostname, alerting by email or webhook — configuration only, no Allerac code involved.

**Tier 2 (internal):** Reuses signals that already exist rather than inventing new ones:
- Per-service Docker healthchecks already defined in `docker-compose.yml` (`app`, `db`, `executor`, `health-worker`, `agent-worker`, `notifier`, `ollama`) — the same `docker inspect --format '{{.State.Health.Status}}'` check `allerac status` and `update.sh`'s `verify_deployment` already perform.
- `allerac verify` (backup/schema/config readiness — see `docs/database-backup-restore.md`).
- `[Context]` log lines already forwarded to `/api/log-submit` by other containers (see the logging pattern under Operations → Logging) — a source of internal error signals without adding new instrumentation.
- Disk pressure on the `db_data`/`backups_data`/`ollama_data` volumes.

## Alert → ticket bridge

Reuses the existing `createTicket` server action, tagged with a distinct source (e.g. `context: { source: 'sustain-agent' }`) so these tickets are visibly agent-originated, pre-filled with whatever diagnosis was gathered.

## Telegram channel

`telegram_bot_configs` already supports multiple bots per install — "Agent Prod" (or whatever name is chosen) is a new row there, not new infrastructure. It can start as notify-only, pushing a message through the same pattern the `notifier` service and the webhook deploy flow already use for Telegram delivery, rather than a full conversational bot.

## Phased delivery

### Phase 1 — External detection
Configure the Cloudflare Health Check and point its alert at email/webhook. No Allerac code changes.

### Phase 2 — Internal detection → ticket
A lightweight watcher (a loop in `agent-worker`, or a small dedicated process) polls container health and `allerac verify` on an interval. On failure, it opens a ticket with diagnosis attached. No mitigation yet — detect and report only, matching "começar com alertas."

### Phase 3 — Telegram notification
Add the "Agent Prod" bot config. Every ticket the watcher opens also pushes a Telegram message.

### Phase 4 — Supervised mitigation
The agent proposes a specific remediation in the ticket (e.g., "restart container X — reasoning: ..."); a human approves that specific action; the agent executes it through an allow-listed, restart-only command set — nothing destructive is ever in that allow-list.

### Phase 5 — Autonomous mitigation (deferred, trust-gated)
Only for a problem class with a proven track record of correct human-approved remediation (e.g., N consecutive successful supervised restarts of the same failure signature). Still logged and notified even when it acts without waiting for approval.

## Guardrails (hold at every phase, not just the later ones)

- No autonomous destructive/irreversible action, ever, without explicit human confirmation at the time.
- The agent never plans or ships features — it tickets the idea for someone else to decide on.
- Every action it takes is visible: in the ticket, in Telegram, and in an audit trail (following the existing `agent_runs`/`api_key_audit_log` pattern).
- Tier 1 detection must never depend on Allerac's own infrastructure being up.

## Definition of done (Phases 1-3)

- The Cloudflare Health Check alerts independently of whether home or the VM is reachable.
- The internal watcher detects at least an unhealthy/crashed container and a failed `allerac verify`.
- A detected failure produces both a ticket and a Telegram message within a few minutes.
- No autonomous mitigation exists yet — every alert still requires a human to open the ticket and decide.

## Deferred

- Any autonomous mitigation (Phase 4 and beyond).
- Distinguishing "home is down" from "VM is down" from "the network between them is partitioned" — start with independent per-target health checks rather than cross-correlation.
- Anomaly/predictive detection — threshold and health-check-based signals only, at first.
