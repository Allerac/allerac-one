-- Migration 041: Ticket management system
-- tickets table + ticket_events audit trail

CREATE TABLE IF NOT EXISTS tickets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id),

  -- Content
  title               TEXT NOT NULL,
  description         TEXT,
  type                TEXT NOT NULL DEFAULT 'task',    -- task | bug | improvement | question

  -- Status lifecycle
  status              TEXT NOT NULL DEFAULT 'open',    -- open | in_progress | resolved | cancelled
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,

  -- Priority (managed by priority service)
  priority_score      INTEGER NOT NULL DEFAULT 50,     -- 0-100, higher = more urgent
  priority_level      TEXT NOT NULL DEFAULT 'medium',  -- critical | high | medium | low
  priority_factors    JSONB,

  -- Ownership
  created_by_type     TEXT NOT NULL DEFAULT 'user',    -- user | agent
  created_by_run_id   UUID REFERENCES agent_runs(id),
  assigned_to_type    TEXT,                            -- user | agent | null

  -- Resolution
  resolved_by_type    TEXT,                            -- user | agent
  resolved_by_run_id  UUID REFERENCES agent_runs(id),
  resolution_notes    TEXT,

  -- Metadata
  tags                TEXT[],
  context             JSONB
);

CREATE INDEX IF NOT EXISTS tickets_user_id_idx    ON tickets(user_id);
CREATE INDEX IF NOT EXISTS tickets_status_idx     ON tickets(status);
CREATE INDEX IF NOT EXISTS tickets_priority_idx   ON tickets(priority_score DESC);
CREATE INDEX IF NOT EXISTS tickets_created_at_idx ON tickets(created_at DESC);

CREATE TABLE IF NOT EXISTS ticket_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  event_type      TEXT NOT NULL,  -- created | status_changed | priority_changed | assigned | comment | resolved | cancelled
  actor_type      TEXT NOT NULL,  -- user | agent | system
  actor_run_id    UUID REFERENCES agent_runs(id),

  previous_value  JSONB,
  new_value       JSONB,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS ticket_events_ticket_id_idx  ON ticket_events(ticket_id);
CREATE INDEX IF NOT EXISTS ticket_events_created_at_idx ON ticket_events(created_at DESC);
