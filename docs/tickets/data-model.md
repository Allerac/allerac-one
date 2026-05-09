# Tickets — Data Model

## Tables

### `tickets`

The core table. One row per ticket.

```sql
CREATE TABLE tickets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id),

  -- Content
  title               TEXT NOT NULL,
  description         TEXT,
  type                TEXT NOT NULL DEFAULT 'task',   -- task | bug | improvement | question

  -- Status lifecycle
  status              TEXT NOT NULL DEFAULT 'open',   -- open | in_progress | resolved | cancelled
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,

  -- Priority (managed by priority service, stored here for fast queries)
  priority_score      INTEGER NOT NULL DEFAULT 50,    -- 0-100, higher = more urgent
  priority_level      TEXT NOT NULL DEFAULT 'medium', -- critical | high | medium | low
  priority_factors    JSONB,                          -- snapshot of why this priority was assigned

  -- Ownership
  created_by_type     TEXT NOT NULL DEFAULT 'user',   -- user | agent
  created_by_run_id   UUID REFERENCES agent_runs(id), -- set when created_by_type = agent
  assigned_to_type    TEXT,                           -- user | agent | null (unassigned)

  -- Resolution
  resolved_by_type    TEXT,                           -- user | agent
  resolved_by_run_id  UUID REFERENCES agent_runs(id), -- set when resolved_by_type = agent
  resolution_notes    TEXT,

  -- Metadata
  tags                TEXT[],
  context             JSONB                           -- arbitrary context from creator
);

CREATE INDEX tickets_user_id_idx       ON tickets(user_id);
CREATE INDEX tickets_status_idx        ON tickets(status);
CREATE INDEX tickets_priority_idx      ON tickets(priority_score DESC);
CREATE INDEX tickets_created_at_idx    ON tickets(created_at DESC);
```

### `ticket_events`

Audit trail. Every state change is recorded here.

```sql
CREATE TABLE ticket_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  event_type      TEXT NOT NULL, -- created | status_changed | priority_changed | assigned | comment | resolved | cancelled
  actor_type      TEXT NOT NULL, -- user | agent | system
  actor_run_id    UUID REFERENCES agent_runs(id),

  previous_value  JSONB,
  new_value       JSONB,
  notes           TEXT
);

CREATE INDEX ticket_events_ticket_id_idx ON ticket_events(ticket_id);
CREATE INDEX ticket_events_created_at_idx ON ticket_events(created_at DESC);
```

## Status Lifecycle

```
open → in_progress → resolved
  ↓                      ↑
  └──────────────────────┘ (agent picks up and resolves directly)
  
open → cancelled
in_progress → cancelled
```

| Transition | Who can trigger |
|---|---|
| `open → in_progress` | User (manual), Dispatcher agent (auto) |
| `in_progress → resolved` | User (manual), Agent (after completing work) |
| `open → resolved` | User (quick resolve), Agent (if trivial) |
| `any → cancelled` | User only |
| `resolved → open` | User (reopen) |

## Type Values

| Type | Description |
|---|---|
| `task` | A piece of work to be done |
| `bug` | Something is broken |
| `improvement` | An enhancement to something existing |
| `question` | Needs investigation or an answer |

## Context Field

The `context` JSONB field captures arbitrary metadata from the creator. Examples:

```json
// Created via chat
{ "source": "chat", "conversation_id": "...", "raw_message": "fix the login bug" }

// Created by an agent during a run
{ "source": "agent_run", "run_id": "...", "worker_name": "code-analyzer", "finding": "..." }

// Created via UI form
{ "source": "ui" }
```
