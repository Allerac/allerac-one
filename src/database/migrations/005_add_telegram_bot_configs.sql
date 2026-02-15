-- Migration: Add telegram_bot_configs table for self-service bot configuration
-- Created: 2026-02-15

-- Create table for storing Telegram bot configurations per user
CREATE TABLE IF NOT EXISTS telegram_bot_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_name VARCHAR(100) NOT NULL,
  bot_token TEXT NOT NULL, -- Encrypted bot token
  bot_username VARCHAR(100), -- Optional: @username of the bot
  allowed_telegram_ids BIGINT[] DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_bot_name UNIQUE(user_id, bot_name)
);

-- Add index for faster lookups by user
CREATE INDEX IF NOT EXISTS idx_telegram_bot_configs_user_id ON telegram_bot_configs(user_id);

-- Add index for enabled bots (for hot reload queries)
CREATE INDEX IF NOT EXISTS idx_telegram_bot_configs_enabled ON telegram_bot_configs(enabled) WHERE enabled = true;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_telegram_bot_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_telegram_bot_configs_updated_at
BEFORE UPDATE ON telegram_bot_configs
FOR EACH ROW
EXECUTE FUNCTION update_telegram_bot_configs_updated_at();

-- Add comment
COMMENT ON TABLE telegram_bot_configs IS 'Self-service Telegram bot configurations per user';
