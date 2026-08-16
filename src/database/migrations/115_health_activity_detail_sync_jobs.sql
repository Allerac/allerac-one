-- Idempotent async queue for Health Phase 2 detail sync. Polled by a second
-- loop in src/agent-worker.ts using the same FOR UPDATE SKIP LOCKED claim
-- pattern as agent_runs (see src/app/services/agents/worker-run.repository.ts).
CREATE TABLE IF NOT EXISTS health_activity_detail_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'running', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  FOREIGN KEY (user_id, activity_id) REFERENCES health_activities (user_id, activity_id) ON DELETE CASCADE,
  UNIQUE (user_id, activity_id)
);

CREATE INDEX IF NOT EXISTS idx_health_activity_detail_sync_jobs_pending
  ON health_activity_detail_sync_jobs (created_at)
  WHERE status = 'pending';
