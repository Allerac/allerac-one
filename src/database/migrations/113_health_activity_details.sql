-- Health Phase 1 (docs/roadmap/health-detailed-activities.md): stop discarding
-- Garmin activity fields. raw_data now holds the true unreduced provider
-- summary (see services/health-worker/garmin.py:normalize_activity_summary);
-- provider_details_raw holds the Phase 2 detail payload (laps/zones source).
ALTER TABLE health_activities
  ADD COLUMN IF NOT EXISTS provider VARCHAR(32),
  ADD COLUMN IF NOT EXISTS provider_activity_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS sport_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS sub_sport_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(100),
  ADD COLUMN IF NOT EXISTS moving_time_seconds NUMERIC,
  ADD COLUMN IF NOT EXISTS elapsed_time_seconds NUMERIC,
  ADD COLUMN IF NOT EXISTS average_pace_seconds_per_km NUMERIC,
  ADD COLUMN IF NOT EXISTS best_pace_seconds_per_km NUMERIC,
  ADD COLUMN IF NOT EXISTS average_power_watts NUMERIC,
  ADD COLUMN IF NOT EXISTS max_power_watts NUMERIC,
  ADD COLUMN IF NOT EXISTS min_elevation_meters NUMERIC,
  ADD COLUMN IF NOT EXISTS max_elevation_meters NUMERIC,
  ADD COLUMN IF NOT EXISTS training_effect_aerobic NUMERIC,
  ADD COLUMN IF NOT EXISTS training_effect_anaerobic NUMERIC,
  ADD COLUMN IF NOT EXISTS training_benefit VARCHAR(64),
  ADD COLUMN IF NOT EXISTS exercise_load NUMERIC,
  ADD COLUMN IF NOT EXISTS average_cadence_spm NUMERIC,
  ADD COLUMN IF NOT EXISTS max_cadence_spm NUMERIC,
  ADD COLUMN IF NOT EXISTS average_stride_length_meters NUMERIC,
  ADD COLUMN IF NOT EXISTS average_vertical_ratio_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS average_vertical_oscillation_cm NUMERIC,
  ADD COLUMN IF NOT EXISTS average_ground_contact_time_ms NUMERIC,
  ADD COLUMN IF NOT EXISTS estimated_sweat_loss_ml NUMERIC,
  ADD COLUMN IF NOT EXISTS beginning_stamina_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS ending_stamina_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS minimum_stamina_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS detail_sync_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS detail_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payload_version INTEGER,
  ADD COLUMN IF NOT EXISTS provider_details_raw JSONB;

ALTER TABLE health_activities
  DROP CONSTRAINT IF EXISTS health_activities_detail_sync_status_check;

ALTER TABLE health_activities
  ADD CONSTRAINT health_activities_detail_sync_status_check
  CHECK (detail_sync_status IN ('pending', 'syncing', 'complete', 'partial', 'failed'));

CREATE INDEX IF NOT EXISTS idx_health_activities_detail_sync_pending
  ON health_activities (user_id, detail_sync_status)
  WHERE detail_sync_status IN ('pending', 'failed');

-- Backfill: existing rows are all Garmin imports.
UPDATE health_activities SET provider = 'garmin' WHERE provider IS NULL;
UPDATE health_activities SET provider_activity_id = activity_id WHERE provider_activity_id IS NULL;
