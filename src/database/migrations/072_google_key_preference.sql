ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS google_key_preference TEXT NOT NULL DEFAULT 'personal'
  CHECK (google_key_preference IN ('personal', 'allerac'));
