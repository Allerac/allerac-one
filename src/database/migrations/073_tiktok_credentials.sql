-- TikTok Login Kit credentials and shared account assignments.

CREATE TABLE IF NOT EXISTS tiktok_credentials (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  open_id                  TEXT,
  display_name             TEXT,
  avatar_url               TEXT,
  access_token_encrypted   TEXT NOT NULL DEFAULT '',
  refresh_token_encrypted  TEXT NOT NULL DEFAULT '',
  token_type               TEXT NOT NULL DEFAULT 'Bearer',
  access_expires_at        TIMESTAMPTZ,
  refresh_expires_at       TIMESTAMPTZ,
  scopes                   TEXT,
  is_connected             BOOLEAN NOT NULL DEFAULT false,
  last_refresh_at          TIMESTAMPTZ,
  last_error               TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_tiktok_credentials_open_id
  ON tiktok_credentials(open_id)
  WHERE open_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tiktok_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label          TEXT NOT NULL,
  owner_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_user_id)
);

CREATE TABLE IF NOT EXISTS user_tiktok_account (
  user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tiktok_account_id  UUID NOT NULL REFERENCES tiktok_accounts(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_tiktok_account_account_id
  ON user_tiktok_account(tiktok_account_id);
