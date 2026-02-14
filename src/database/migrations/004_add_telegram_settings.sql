-- Add Telegram bot token to user settings
-- Allows configuring the bot token from the web UI instead of env vars

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT;
