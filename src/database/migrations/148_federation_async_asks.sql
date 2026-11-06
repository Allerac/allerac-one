-- Migration 148: Async federated asks, inbox polling and unread (federation P4c).
--
-- Peer side: the P4b dedupe table doubles as the async result store; a
-- background ask carries its own deadline and an error code when it fails.
-- Home side: pending inbox messages are polled by key with backoff, unread
-- counts get an index, and the ask_peer_agent chat tool maps each local
-- conversation (+ peer + agent) to its own remote conversation.

ALTER TABLE federation_ask_dedupe
  ADD COLUMN IF NOT EXISTS mode VARCHAR(8) NOT NULL DEFAULT 'sync',
  ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_code VARCHAR(64);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'federation_ask_dedupe_mode_check') THEN
    ALTER TABLE federation_ask_dedupe
      ADD CONSTRAINT federation_ask_dedupe_mode_check CHECK (mode IN ('sync', 'async'));
  END IF;
END $$;

ALTER TABLE federated_messages
  ADD COLUMN IF NOT EXISTS next_poll_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS poll_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_deadline_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_federated_messages_due
  ON federated_messages (next_poll_at) WHERE status = 'pending' AND remote_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_federated_messages_unread
  ON federated_messages (thread_id, created_at) WHERE role = 'agent';

CREATE TABLE IF NOT EXISTS federated_tool_conversations (
  local_conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  peer_id UUID NOT NULL REFERENCES federation_peers(id) ON DELETE CASCADE,
  agent_slug VARCHAR(100) NOT NULL,
  remote_conversation_id VARCHAR(100) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (local_conversation_id, peer_id, agent_slug)
);
