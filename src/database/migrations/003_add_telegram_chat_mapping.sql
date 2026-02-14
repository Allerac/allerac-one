-- Telegram chat mapping
-- Maps Telegram chat IDs to Allerac users and conversations

CREATE TABLE IF NOT EXISTS telegram_chat_mapping (
  telegram_chat_id BIGINT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_conversation_id UUID REFERENCES chat_conversations(id) ON DELETE SET NULL,
  telegram_user_id BIGINT NOT NULL,
  telegram_username TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_chat_user_id ON telegram_chat_mapping(user_id);
