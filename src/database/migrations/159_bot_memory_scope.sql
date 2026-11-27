-- Migration 159: Bot memory scope (multi-bot per Unit, PR 3).
--
-- * `shared` on conversation_summaries and documents. DEFAULT TRUE: existing
--   rows, and everything the default bot, legacy domains and Telegram write,
--   stay visible to the whole Unit exactly as today. Only a bot writes
--   `shared = false` explicitly. ADD COLUMN ... DEFAULT TRUE fills existing
--   rows once, so a re-run never flips a private row back to shared.
-- * The semantic index needs no flag: memory vector search joins
--   conversation_summaries and filters on its `shared`.
-- * unit_agents: memory mode `all` (the default bot reads every memory,
--   other bots' private ones included, by owner decision 2026-11-27) and
--   `share_memories_by_default`.
--
-- See docs/roadmap/multi-bot-per-unit.md. Idempotent: safe to run again.

ALTER TABLE conversation_summaries ADD COLUMN IF NOT EXISTS shared BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE documents              ADD COLUMN IF NOT EXISTS shared BOOLEAN NOT NULL DEFAULT TRUE;

-- Private rows are the rare case: index them for the isolated-bot filter.
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_private
  ON conversation_summaries (user_id, domain_slug) WHERE NOT shared;

ALTER TABLE unit_agents ADD COLUMN IF NOT EXISTS share_memories_by_default BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE unit_agents DROP CONSTRAINT IF EXISTS unit_agents_memory_mode_check;
ALTER TABLE unit_agents ADD CONSTRAINT unit_agents_memory_mode_check
  CHECK (memory_mode IN ('isolated', 'all', 'none'));

UPDATE unit_agents
   SET memory_mode = 'all', share_memories_by_default = TRUE
 WHERE is_default AND (memory_mode <> 'all' OR NOT share_memories_by_default);
