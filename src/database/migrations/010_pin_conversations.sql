-- Add pinned flag to conversations
ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;
