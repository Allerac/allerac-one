-- Migration 147: Federated conversation continuity (federation P4b).
--
-- Peer side: a federated conversation belongs to the paired principal that
-- created it, so a conversation_id is only accepted from the same principal.
-- Asks carry an Idempotency-Key; replies are kept for 24h so a retry replays
-- the stored answer instead of running the agent again.
-- Home side: several threads per remote agent (one default) and keyset
-- pagination over thread messages.

ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS federation_principal_id UUID REFERENCES service_principals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_federation_principal
  ON chat_conversations (federation_principal_id, user_id) WHERE source = 'federation';

CREATE TABLE IF NOT EXISTS federation_ask_dedupe (
  principal_id UUID NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('in_progress', 'done', 'failed')),
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (principal_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_federation_ask_dedupe_created ON federation_ask_dedupe (created_at);

-- Home side: many threads per (user, peer, agent), at most one default.
ALTER TABLE federated_threads ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
DO $$
BEGIN
  -- Only on the first run: every P4a thread was the default one.
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_federated_threads_default'
      AND indexdef NOT ILIKE '%WHERE%'
  ) THEN
    UPDATE federated_threads SET is_default = true;
    DROP INDEX idx_federated_threads_default;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_federated_threads_default
  ON federated_threads (user_id, peer_id, agent_slug) WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_federated_messages_thread_page
  ON federated_messages (thread_id, created_at DESC, id DESC);


-- Federated conversations stay out of long-term memory and RAG: drop any
-- derived memory index rows for them (summaries created before mig 146).
DELETE FROM knowledge_semantic_index ksi
 USING conversation_summaries cs, chat_conversations cc
 WHERE ksi.source_type = 'memory' AND ksi.source_id = cs.id
   AND cc.id = cs.conversation_id AND cc.source = 'federation';
