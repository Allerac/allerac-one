-- Instagram credentials storage
-- Stores encrypted Instagram OAuth tokens and connection state per user.
-- Follows the same pattern as garmin_credentials (015).

CREATE TABLE IF NOT EXISTS instagram_credentials (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ig_user_id              TEXT,                          -- Instagram numeric user ID
  username                TEXT,                          -- @handle
  access_token_encrypted  TEXT        NOT NULL DEFAULT '',
  token_type              TEXT        NOT NULL DEFAULT 'bearer',
  expires_at              TIMESTAMPTZ,                   -- NULL = non-expiring token
  scopes                  TEXT,                          -- space-separated granted scopes
  is_connected            BOOLEAN     NOT NULL DEFAULT false,
  last_error              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_instagram_credentials_user_id ON instagram_credentials(user_id);
