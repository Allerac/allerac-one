-- Health daily metrics
-- One row per user per day. Replaces InfluxDB measurements from allerac-health.
-- All metric columns are nullable — a sync may fetch partial data.

CREATE TABLE IF NOT EXISTS health_daily_metrics (
  id                          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date                        DATE    NOT NULL,

  -- Activity
  steps                       INTEGER,
  calories                    INTEGER,
  distance_meters             INTEGER,
  active_minutes              INTEGER,
  floors_climbed              INTEGER,

  -- Heart rate
  resting_hr                  INTEGER,
  avg_hr                      INTEGER,
  max_hr                      INTEGER,

  -- Sleep
  sleep_duration_minutes      INTEGER,
  sleep_deep_minutes          INTEGER,
  sleep_light_minutes         INTEGER,
  sleep_rem_minutes           INTEGER,
  sleep_awake_minutes         INTEGER,
  sleep_score                 INTEGER,

  -- Body battery
  body_battery_min            INTEGER,
  body_battery_max            INTEGER,
  body_battery_end            INTEGER,
  body_battery_charged        INTEGER,
  body_battery_drained        INTEGER,

  -- Stress
  stress_avg                  INTEGER,
  stress_max                  INTEGER,
  stress_rest_duration_minutes INTEGER,

  -- HRV
  hrv_weekly_avg              INTEGER,
  hrv_last_night              INTEGER,
  hrv_status                  VARCHAR(50),

  created_at                  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, date)
);

-- Primary access pattern: all metrics for a user ordered by date
CREATE INDEX IF NOT EXISTS idx_health_daily_metrics_user_date
  ON health_daily_metrics (user_id, date DESC);
