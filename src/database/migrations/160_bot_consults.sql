-- Migration 160: Manager consults (multi-bot PR 7).
--
-- The default agent (the Manager) can ask a bot of this Unit a question
-- (tool ask_agent). Each consult runs the bot's normal turn, read-only, in a
-- hand-off conversation tagged source = 'handoff': it stays in chat history
-- but never feeds long-term memory, RAG or chat search (same rule as
-- source = 'federation'). One row per consult, for audit and continuity: the
-- next consult from the same Manager conversation to the same bot continues
-- the hand-off conversation of the latest row.
--
-- Additive and idempotent. Nothing existing is rewritten.

CREATE TABLE IF NOT EXISTS bot_consults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caller_slug VARCHAR(100) NOT NULL,
  caller_conversation_id UUID REFERENCES chat_conversations(id) ON DELETE SET NULL,
  target_slug VARCHAR(100) NOT NULL,
  handoff_conversation_id UUID REFERENCES chat_conversations(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('ok', 'error', 'timeout')),
  error_code VARCHAR(64),
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_consults_continuity
  ON bot_consults (caller_conversation_id, target_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_consults_user_recent
  ON bot_consults (user_id, created_at DESC);
