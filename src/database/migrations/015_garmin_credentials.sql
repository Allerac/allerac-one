-- Garmin credentials storage
-- Stores encrypted Garmin OAuth tokens and connection state per user.
-- Replaces garmin_credentials table from allerac-health.

CREATE TABLE IF NOT EXISTS garmin_credentials (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_encrypted         TEXT        NOT NULL,
  password_encrypted      TEXT,
  oauth1_token_encrypted  TEXT,       -- garminconnect session dump (JSON)
  oauth2_token_encrypted  TEXT,
  is_connected            BOOLEAN     NOT NULL DEFAULT false,
  mfa_pending             BOOLEAN     NOT NULL DEFAULT false,
  last_sync_at            TIMESTAMP,
  last_error              TEXT,
  sync_enabled            BOOLEAN     NOT NULL DEFAULT true,
  created_at              TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP   NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);
