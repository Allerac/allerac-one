-- Health Phase 3 (docs/roadmap/health-detailed-activities.md): GPS and
-- timestamped metric samples. Detailed coordinates for the activity page,
-- synchronized charts, and analysis; the simplified route lives on
-- health_activities (see 117_health_activity_route.sql).
CREATE TABLE IF NOT EXISTS health_activity_samples (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id VARCHAR(255) NOT NULL,
  sample_index INTEGER NOT NULL CHECK (sample_index >= 0),
  timestamp BIGINT,
  elapsed_seconds NUMERIC,
  latitude NUMERIC,
  longitude NUMERIC,
  elevation_meters NUMERIC,
  distance_meters NUMERIC,
  heart_rate_bpm NUMERIC,
  pace_seconds_per_km NUMERIC,
  speed_meters_per_second NUMERIC,
  power_watts NUMERIC,
  cadence_spm NUMERIC,
  stamina_percent NUMERIC,
  stamina_potential_percent NUMERIC,
  ground_contact_time_ms NUMERIC,
  stride_length_meters NUMERIC,
  vertical_oscillation_cm NUMERIC,
  run_walk_state VARCHAR(16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  FOREIGN KEY (user_id, activity_id) REFERENCES health_activities (user_id, activity_id) ON DELETE CASCADE,
  UNIQUE (user_id, activity_id, sample_index)
);

CREATE INDEX IF NOT EXISTS idx_health_activity_samples_activity
  ON health_activity_samples (user_id, activity_id);
