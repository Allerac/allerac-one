-- Provider-neutral performance fields currently supplied by Strava details.
ALTER TABLE health_activities
  ADD COLUMN IF NOT EXISTS relative_effort NUMERIC,
  ADD COLUMN IF NOT EXISTS perceived_exertion NUMERIC,
  ADD COLUMN IF NOT EXISTS weighted_average_power_watts NUMERIC,
  ADD COLUMN IF NOT EXISTS energy_kilojoules NUMERIC,
  ADD COLUMN IF NOT EXISTS source_device TEXT,
  ADD COLUMN IF NOT EXISTS best_effort_count INTEGER;
