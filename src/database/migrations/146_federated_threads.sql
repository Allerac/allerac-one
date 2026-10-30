-- Migration 146: Unified inbox, home-side mirror of federated chats (federation P4a).
--
-- Remote agent threads live in their own tables, never in chat_conversations,
-- so local memory extraction, RAG and search never pick up remote text.
-- Nothing here is written to a peer; the peer keeps its own side.

CREATE TABLE IF NOT EXISTS federated_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  peer_id UUID NOT NULL REFERENCES federation_peers(id) ON DELETE CASCADE,
  agent_slug VARCHAR(100) NOT NULL,
  -- P4b: continuity handle returned by the peer.
  remote_conversation_id VARCHAR(100),
  title VARCHAR(200),
  last_message_at TIMESTAMPTZ,
  last_read_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_federated_threads_user_recent
  ON federated_threads (user_id, last_message_at DESC);
-- P4a: one default thread per (user, peer, agent).
CREATE UNIQUE INDEX IF NOT EXISTS idx_federated_threads_default
  ON federated_threads (user_id, peer_id, agent_slug);

CREATE TABLE IF NOT EXISTS federated_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES federated_threads(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL CHECK (role IN ('user', 'agent', 'system')),
  content TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'done' CHECK (status IN ('pending', 'done', 'failed', 'timeout')),
  remote_message_id VARCHAR(100),
  remote_run_id VARCHAR(100),
  truncated BOOLEAN NOT NULL DEFAULT false,
  error_code VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_federated_messages_thread
  ON federated_messages (thread_id, created_at);

-- Each inbox send is audited with its thread.
ALTER TABLE federation_audit_log
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES federated_threads(id) ON DELETE SET NULL;

-- Peer side (decision 1): conversations created to answer a paired Unit are
-- tagged so they stay in chat history but out of long-term memory.
ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'local';
UPDATE chat_conversations SET source = 'federation'
  WHERE source = 'local' AND title LIKE 'Federation · %';
