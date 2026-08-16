-- Garmin returns vO2MaxValue on the activity summary for some workouts
-- (see docs/roadmap/health-detailed-activities.md's normalized field list).
ALTER TABLE health_activities
  ADD COLUMN IF NOT EXISTS vo2_max NUMERIC;
