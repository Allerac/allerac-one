-- Migration 038: Add domain_slug to chat_conversations
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS domain_slug TEXT;

-- Existing conversations belong to the chat domain
UPDATE chat_conversations SET domain_slug = 'chat' WHERE domain_slug IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_domain ON chat_conversations(user_id, domain_slug);
