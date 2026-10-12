-- Generic, provider-agnostic connection status/config, decoupled from any single
-- credential table. Credential tables (garmin_credentials, spotify_credentials, ...)
-- keep only secrets + provider-specific transient auth state; everything about
-- connection status/config lives here instead. See docs/architecture/allerac-bridge.md.
CREATE TABLE IF NOT EXISTS integration_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  is_connected    BOOLEAN NOT NULL DEFAULT false,
  data_mode       TEXT NOT NULL DEFAULT 'cached' CHECK (data_mode IN ('cached', 'proxy')),
  sync_enabled    BOOLEAN NOT NULL DEFAULT true,
  last_sync_at    TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integration_connections_user_provider
  ON integration_connections(user_id, provider);

-- Backfill from the existing Garmin connection rows.
INSERT INTO integration_connections (
  user_id, provider, is_connected, data_mode, sync_enabled, last_sync_at, last_error, created_at, updated_at
)
SELECT user_id, 'garmin', is_connected, data_mode, sync_enabled, last_sync_at, last_error, created_at, updated_at
FROM garmin_credentials
ON CONFLICT (user_id, provider) DO NOTHING;

-- These fields fully move to integration_connections; garmin_credentials keeps only
-- the encrypted secrets and Garmin-specific transient auth state (mfa_pending).
ALTER TABLE garmin_credentials
  DROP COLUMN IF EXISTS is_connected,
  DROP COLUMN IF EXISTS data_mode,
  DROP COLUMN IF EXISTS sync_enabled,
  DROP COLUMN IF EXISTS last_sync_at,
  DROP COLUMN IF EXISTS last_error;

-- Standalone domain for connection-only accounts (no chat shell) — see
-- src/app/bridge/page.tsx.
INSERT INTO domains (slug, display_name, is_active)
VALUES ('bridge', 'Bridge', true)
ON CONFLICT (slug) DO NOTHING;
