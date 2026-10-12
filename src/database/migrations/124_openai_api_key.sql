-- Add OpenAI API key support to user settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS openai_api_key TEXT;
