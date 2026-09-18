-- Read-only external connectors for Notes (OneNote, Google Drive).
-- See docs/roadmap/notes-external-connectors.md.
--
-- Connection status (is_connected/last_sync_at/last_error) lives in the
-- existing generic integration_connections table (provider = 'onenote' |
-- 'google_drive'); this migration only adds secrets + item-level dedup and
-- conflict tracking, which have no existing generic equivalent.

CREATE TABLE IF NOT EXISTS notes_connector_credentials (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider                 TEXT NOT NULL CHECK (provider IN ('onenote', 'google_drive')),
  provider_account_id      TEXT,
  provider_account_label   TEXT,
  access_token_encrypted   TEXT NOT NULL DEFAULT '',
  refresh_token_encrypted  TEXT NOT NULL DEFAULT '',
  access_token_expires_at  TIMESTAMPTZ,
  granted_scopes           TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

-- One row per imported item, keyed by the credential it came through plus the
-- provider's own item id. Tracks enough state to make re-sync idempotent and
-- to detect (never silently resolve) a conflict between a local edit and an
-- upstream change. Mirrors crawler_documents' source_id+external_id dedup
-- pattern (see 112_crawler_integration.sql).
CREATE TABLE IF NOT EXISTS notes_connector_items (
  credential_id                  UUID NOT NULL REFERENCES notes_connector_credentials(id) ON DELETE CASCADE,
  external_id                    TEXT NOT NULL,
  note_id                        UUID NOT NULL UNIQUE REFERENCES user_notes(id) ON DELETE CASCADE,
  source_url                     TEXT NOT NULL,
  external_content_hash          TEXT NOT NULL,
  imported_content_hash          TEXT NOT NULL,
  pending_external_content_hash  TEXT,
  status                         TEXT NOT NULL DEFAULT 'synced' CHECK (status IN ('synced', 'conflict')),
  provider_modified_at           TIMESTAMPTZ,
  first_imported_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (credential_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_notes_connector_items_credential
  ON notes_connector_items (credential_id);
