-- Health sync jobs
-- Tracks Garmin data sync history per user.
-- Replaces sync_jobs table from allerac-health.

CREATE TABLE IF NOT EXISTS health_sync_jobs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending|running|completed|failed
  job_type         VARCHAR(20) NOT NULL DEFAULT 'manual',   -- full|incremental|manual
  started_at       TIMESTAMP,
  completed_at     TIMESTAMP,
  records_fetched  INTEGER,
  error_message    TEXT,
  metadata         JSONB,
  created_at       TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_sync_jobs_user_created
  ON health_sync_jobs (user_id, created_at DESC);
