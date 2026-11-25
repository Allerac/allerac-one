-- Migration 157: shared Unit terminal (docs/roadmap/unit-terminal-container.md).
--
-- 1. Service accounts: non-human users that own API keys (the terminal's
--    allerac_unit MCP tools act as one). They have no password, cannot hold a
--    session and are hidden from user management.
-- 2. user_terminal_access: admins grant the terminal per user. It is a
--    dedicated permission, not a domain, because domains are chat agents
--    (listed by /api/domains, the Control API, skills and the Unit landing).
--    Admins have access implicitly.
-- 3. terminal_session_events: lifecycle history only (who started, reconnected
--    or stopped a session and how it ended). Never input or output.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_service_account BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS user_terminal_access (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS terminal_session_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider   TEXT NOT NULL CHECK (provider IN ('claude', 'codex')),
  session_id UUID NOT NULL,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  event      TEXT NOT NULL CHECK (event IN ('started', 'reconnected', 'stopped', 'exited', 'idle_timeout')),
  exit_code  INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_terminal_session_events_created
  ON terminal_session_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_terminal_session_events_session
  ON terminal_session_events(session_id, created_at);
-- A session ends once: concurrent tabs observing the end record it idempotently.
CREATE UNIQUE INDEX IF NOT EXISTS uq_terminal_session_events_end
  ON terminal_session_events(session_id)
  WHERE event IN ('stopped', 'exited', 'idle_timeout');
