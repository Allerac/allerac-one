-- Add Anthropic API key support to user settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT;
