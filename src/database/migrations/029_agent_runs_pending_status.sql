-- Add 'pending' status to agent_runs and add error_message column
-- 'pending' is used when a run is created but not yet picked up by the worker

ALTER TABLE agent_runs ALTER COLUMN status SET DEFAULT 'pending';

-- Recreate the CHECK constraint to include 'pending'
ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_status_check;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_status_check CHECK (status IN ('pending', 'planning', 'running', 'aggregating', 'completed', 'failed'));

-- Add error_message column for failed runs
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add last_heartbeat for stale run detection
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_agent_runs_status_heartbeat ON agent_runs(status, last_heartbeat);
