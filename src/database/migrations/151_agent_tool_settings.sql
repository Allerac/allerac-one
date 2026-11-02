-- Migration 151: Agent tool settings (simplification phase 3a).
-- Per-Unit toggles for the modules, tools and skills the local `chat` agent
-- may use. Stored on the singleton unit_profile row. An empty object means
-- "use the defaults" (see src/app/services/agent/agent-tool-settings.ts).
-- Local only: never sent to paired Units. No data move.

ALTER TABLE unit_profile
  ADD COLUMN IF NOT EXISTS agent_tool_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
