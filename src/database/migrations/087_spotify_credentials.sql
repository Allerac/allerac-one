-- Spotify OAuth credentials, one connection per Allerac user.

CREATE TABLE IF NOT EXISTS spotify_credentials (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spotify_user_id          TEXT,
  display_name             TEXT,
  avatar_url               TEXT,
  access_token_encrypted   TEXT NOT NULL DEFAULT '',
  refresh_token_encrypted  TEXT NOT NULL DEFAULT '',
  token_type               TEXT NOT NULL DEFAULT 'Bearer',
  access_expires_at        TIMESTAMPTZ,
  scopes                   TEXT,
  is_connected             BOOLEAN NOT NULL DEFAULT false,
  last_sync_at             TIMESTAMPTZ,
  last_error               TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_spotify_credentials_spotify_user_id
  ON spotify_credentials(spotify_user_id) WHERE spotify_user_id IS NOT NULL;
