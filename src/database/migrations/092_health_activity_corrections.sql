-- User/assistant corrections are kept separately from Garmin's raw payload so
-- that a later Garmin import cannot silently overwrite the local truth.
ALTER TABLE health_activities
  ADD COLUMN IF NOT EXISTS corrected_exercise_sets JSONB,
  ADD COLUMN IF NOT EXISTS garmin_sync_status VARCHAR(32),
  ADD COLUMN IF NOT EXISTS garmin_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS garmin_sync_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correction_updated_at TIMESTAMP;

ALTER TABLE health_activities
  DROP CONSTRAINT IF EXISTS health_activities_garmin_sync_status_check;

ALTER TABLE health_activities
  ADD CONSTRAINT health_activities_garmin_sync_status_check
  CHECK (
    garmin_sync_status IS NULL OR
    garmin_sync_status IN ('pending', 'synced', 'garmin_sync_failed')
  );

CREATE INDEX IF NOT EXISTS idx_health_activities_pending_garmin_sync
  ON health_activities(user_id, correction_updated_at)
  WHERE garmin_sync_status IN ('pending', 'garmin_sync_failed');
