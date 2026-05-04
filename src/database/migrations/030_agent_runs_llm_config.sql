-- Add llm_model and llm_provider columns to agent_runs
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS llm_model TEXT DEFAULT 'qwen2.5:3b';
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS llm_provider TEXT DEFAULT 'ollama';
