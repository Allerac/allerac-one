-- Health Phase 3: route bounds and a simplified, renderer-neutral encoded
-- polyline for list previews and fast initial rendering. Detailed
-- coordinates live in health_activity_samples.
ALTER TABLE health_activities
  ADD COLUMN IF NOT EXISTS route_min_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS route_max_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS route_min_lon NUMERIC,
  ADD COLUMN IF NOT EXISTS route_max_lon NUMERIC,
  ADD COLUMN IF NOT EXISTS route_simplified_polyline TEXT,
  ADD COLUMN IF NOT EXISTS route_sample_count INTEGER;
