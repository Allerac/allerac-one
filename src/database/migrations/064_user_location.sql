-- Add location field to user_settings
-- Stores user's city/location for context-aware responses (e.g. weather, local news)
-- Not sensitive — stored as plain text

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS location TEXT DEFAULT NULL;
