-- Migration 158: Bot registry (multi-bot per Unit, PR 1).
--
-- One row per bot inside this Unit. The bot slug is the key that existing
-- `domain_slug` columns already carry, so no data moves. Nothing reads this
-- table for chat yet: PR 1 only adds the registry and a read-only API.
--
-- The default bot (slug `chat`) is the existing single agent. Its identity,
-- instructions and tool settings stay on `unit_profile` (they are NULL / empty
-- here and resolved from the profile in code), so the two can never drift.
--
-- See docs/roadmap/multi-bot-per-unit.md. Idempotent: safe to run again.

CREATE TABLE IF NOT EXISTS unit_agents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               VARCHAR(63) NOT NULL UNIQUE
                     CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  display_name       VARCHAR(100),
  emoji              VARCHAR(16),
  avatar_url         TEXT,
  role               VARCHAR(200),
  description        VARCHAR(1000),
  instructions       TEXT CHECK (instructions IS NULL OR char_length(instructions) <= 8000),
  is_default         BOOLEAN NOT NULL DEFAULT FALSE,
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  tool_settings      JSONB   NOT NULL DEFAULT '{}'::jsonb,
  memory_mode        VARCHAR(12) NOT NULL DEFAULT 'isolated'
                     CHECK (memory_mode IN ('isolated', 'none')),
  can_call           TEXT[]  NOT NULL DEFAULT '{}',
  model_id           TEXT,
  model_provider     TEXT,
  cloud_allowed      BOOLEAN NOT NULL DEFAULT TRUE,
  default_skill_id   UUID REFERENCES skills(id) ON DELETE SET NULL,
  federation_exposed BOOLEAN NOT NULL DEFAULT FALSE,
  template           VARCHAR(63),
  archived_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Only the default bot may leave its name empty (it inherits the Unit's).
  CONSTRAINT unit_agents_name_required CHECK (is_default OR display_name IS NOT NULL),
  -- The default bot can never be disabled or archived.
  CONSTRAINT unit_agents_default_active CHECK (NOT is_default OR (enabled AND archived_at IS NULL))
);

-- Exactly one default bot.
CREATE UNIQUE INDEX IF NOT EXISTS uq_unit_agents_default ON unit_agents (is_default) WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_unit_agents_active_order
  ON unit_agents (sort_order, created_at) WHERE archived_at IS NULL;

-- Seed the default bot. No dependency on unit_profile having a row: identity
-- is resolved from the profile (or env) at read time.
INSERT INTO unit_agents (slug, is_default, memory_mode, federation_exposed)
VALUES ('chat', TRUE, 'isolated', FALSE)
ON CONFLICT (slug) DO NOTHING;
