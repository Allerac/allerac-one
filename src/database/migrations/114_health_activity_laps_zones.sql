-- Health Phase 2 (docs/roadmap/health-detailed-activities.md): laps and
-- time-in-zone aggregates as child tables, keyed off health_activities'
-- existing natural key (user_id, activity_id). Route/GPS samples are Phase 3.
CREATE TABLE IF NOT EXISTS health_activity_laps (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id VARCHAR(255) NOT NULL,
  lap_index INTEGER NOT NULL CHECK (lap_index > 0),
  start_offset_seconds NUMERIC,
  duration_seconds NUMERIC,
  distance_meters NUMERIC,
  pace_seconds_per_km NUMERIC,
  average_heart_rate NUMERIC,
  average_power_watts NUMERIC,
  average_cadence_spm NUMERIC,
  ascent_meters NUMERIC,
  descent_meters NUMERIC,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  FOREIGN KEY (user_id, activity_id) REFERENCES health_activities (user_id, activity_id) ON DELETE CASCADE,
  UNIQUE (user_id, activity_id, lap_index)
);

CREATE INDEX IF NOT EXISTS idx_health_activity_laps_activity
  ON health_activity_laps (user_id, activity_id);

CREATE TABLE IF NOT EXISTS health_activity_zones (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id VARCHAR(255) NOT NULL,
  metric_type VARCHAR(32) NOT NULL CHECK (metric_type IN ('heart_rate', 'power')),
  zone_number INTEGER NOT NULL CHECK (zone_number > 0),
  lower_bound NUMERIC,
  upper_bound NUMERIC,
  duration_seconds NUMERIC,
  percent NUMERIC,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  FOREIGN KEY (user_id, activity_id) REFERENCES health_activities (user_id, activity_id) ON DELETE CASCADE,
  UNIQUE (user_id, activity_id, metric_type, zone_number)
);

CREATE INDEX IF NOT EXISTS idx_health_activity_zones_activity
  ON health_activity_zones (user_id, activity_id);
