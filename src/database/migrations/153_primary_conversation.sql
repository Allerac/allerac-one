-- Migration 153: one primary conversation per agent (simplification phase 4a).
--
-- * chat_conversations.is_primary: the single continuous conversation a user
--   has with this Unit's agent. Local chats are keyed by (user, domain);
--   federated ones also by the calling principal. Created lazily by the app.
-- * chat_messages.kind: 'topic_marker' rows mark a "New topic"; prompt context
--   restarts after the latest marker. Nothing is deleted.
-- * conversation_segments: rolling summaries of older blocks of a primary
--   conversation. The embedding is filled later (phase 4b search).
-- Existing conversations stay as they are (is_primary = false).

ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_conversations_primary
  ON chat_conversations (
    user_id,
    source,
    domain_slug,
    COALESCE(federation_principal_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE is_primary;

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS kind VARCHAR(16);

CREATE INDEX IF NOT EXISTS idx_chat_messages_topic_marker
  ON chat_messages (conversation_id, created_at DESC)
  WHERE kind = 'topic_marker';

CREATE TABLE IF NOT EXISTS conversation_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  start_message_id UUID,
  end_message_id UUID,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_segments_conversation
  ON conversation_segments (conversation_id, end_at DESC);
