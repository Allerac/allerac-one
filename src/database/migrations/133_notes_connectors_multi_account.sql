-- Multiple accounts per provider (e.g. personal + work Google Drive) for
-- notes connectors. See docs/roadmap/notes-external-connectors.md.
--
-- This reverses the "one connection per (user_id, provider), matching
-- integration_connections" decision from 132_notes_connectors.sql: a real
-- need for multiple simultaneous accounts per provider showed up, and
-- integration_connections (UNIQUE(user_id, provider), shared with
-- Garmin/Strava/Spotify) can't represent that. Status now lives directly on
-- notes_connector_credentials instead — a deliberate, documented exception
-- to the shared-status convention for this domain only.

ALTER TABLE notes_connector_credentials
  DROP CONSTRAINT IF EXISTS notes_connector_credentials_user_id_provider_key;

ALTER TABLE notes_connector_credentials
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'error')),
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- provider_account_id is always populated by both connectors' token exchange
-- (Google: about.get permissionId; Microsoft: ID token oid/sub), so this is
-- effectively UNIQUE(user_id, provider, real_account) in practice.
ALTER TABLE notes_connector_credentials
  ADD CONSTRAINT notes_connector_credentials_user_provider_account_key
  UNIQUE (user_id, provider, provider_account_id);
