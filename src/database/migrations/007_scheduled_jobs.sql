-- Migration 007: Scheduled jobs and execution history for cron-based prompt scheduling

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  cron_expr   TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  channels    TEXT[] NOT NULL DEFAULT '{"telegram"}',
  enabled     BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_user_id ON scheduled_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(enabled) WHERE enabled = true;

CREATE TABLE IF NOT EXISTS job_executions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
  status       TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  result       TEXT,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_job_executions_job_id ON job_executions(job_id);
CREATE INDEX IF NOT EXISTS idx_job_executions_status ON job_executions(status);

CREATE OR REPLACE FUNCTION update_scheduled_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_scheduled_jobs_updated_at
BEFORE UPDATE ON scheduled_jobs
FOR EACH ROW
EXECUTE FUNCTION update_scheduled_jobs_updated_at();

COMMENT ON TABLE scheduled_jobs IS 'Cron-based scheduled prompt jobs per user';
COMMENT ON TABLE job_executions IS 'Execution history for scheduled jobs';
