-- Track bot messages so reactions can be linked back to conversations
CREATE TABLE IF NOT EXISTS telegram_bot_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id         BIGINT NOT NULL,
  message_id      INTEGER NOT NULL,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID,  -- nullable (conversation may be deleted later)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(chat_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_tbm_chat_message ON telegram_bot_messages(chat_id, message_id);

-- Auto-delete old entries after 30 days (reactions after 30 days are ignored by Telegram anyway)
CREATE OR REPLACE FUNCTION delete_old_bot_messages() RETURNS void AS $$
BEGIN
  DELETE FROM telegram_bot_messages WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;
