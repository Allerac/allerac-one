-- Migration 043: Add skill_id to agent_runs for skill-aware execution
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS skill_id UUID REFERENCES skills(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_agent_runs_skill ON agent_runs(skill_id);
