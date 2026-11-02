-- Migration 154: chat search, archive and paged history (simplification phase 4b).
--
-- * Full-text search over chat messages: GIN expression index on
--   to_tsvector('simple', content). 'simple' because users write in several
--   languages; the query must use the same expression to hit the index.
-- * Keyset pagination: (conversation_id, created_at, id).
-- * conversation_segments.embedding moves to the local embedding space
--   (vector(768), see migration 103). Migration 153 created it as
--   vector(1536) and it was never filled, so it is dropped and re-added.
-- Tickets live in their own tables and are not indexed here.

CREATE INDEX IF NOT EXISTS idx_chat_messages_content_fts
  ON chat_messages USING gin (to_tsvector('simple', content));

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_page
  ON chat_messages (conversation_id, created_at DESC, id DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    WHERE c.relname = 'conversation_segments' AND a.attname = 'embedding'
      AND NOT a.attisdropped AND format_type(a.atttypid, a.atttypmod) <> 'vector(768)'
  ) THEN
    ALTER TABLE conversation_segments DROP COLUMN embedding;
  END IF;
END $$;

ALTER TABLE conversation_segments
  ADD COLUMN IF NOT EXISTS embedding vector(768),
  ADD COLUMN IF NOT EXISTS embedding_version TEXT,
  ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversation_segments_embedding
  ON conversation_segments USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_conversation_segments_pending_embedding
  ON conversation_segments (created_at)
  WHERE embedding IS NULL;
