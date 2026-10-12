-- Per-user default domain/model for the terminal CLI client (scripts/allerac-chat.mjs).
-- Fetched via GET /api/v1/me so the CLI doesn't need env vars for these.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS cli_domain_slug TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS cli_model_id TEXT;
