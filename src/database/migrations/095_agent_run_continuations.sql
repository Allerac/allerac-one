ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS parent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS domain_slug VARCHAR(100) REFERENCES domains(slug) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_runs_parent_run
  ON agent_runs(parent_run_id)
  WHERE parent_run_id IS NOT NULL;
