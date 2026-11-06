-- Migration 145: Unit identity & role (federation P3.5).
-- Singleton row describing what this Unit is for. The Unit name (identity)
-- stays in env (ALLERAC_UNIT_NAME); the role here is editable by admins.

CREATE TABLE IF NOT EXISTS unit_profile (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  display_name VARCHAR(100),
  emoji VARCHAR(16),
  role VARCHAR(200),
  description VARCHAR(1000),
  tags TEXT[] NOT NULL DEFAULT '{}',
  -- Short description per exposed agent: { "<domain slug>": "<text>" }.
  agent_descriptions JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Opt-in: also tell public domains (sales, openworld) who this Unit is.
  identity_in_public_domains BOOLEAN,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);
