-- Optional per-job model selection. NULL preserves the existing automatic policy.

ALTER TABLE scheduled_jobs
  ADD COLUMN IF NOT EXISTS llm_model TEXT,
  ADD COLUMN IF NOT EXISTS llm_provider TEXT;

ALTER TABLE scheduled_jobs DROP CONSTRAINT IF EXISTS scheduled_jobs_llm_selection_check;
ALTER TABLE scheduled_jobs ADD CONSTRAINT scheduled_jobs_llm_selection_check CHECK (
  (llm_model IS NULL AND llm_provider IS NULL)
  OR
  (llm_model IS NOT NULL AND llm_provider IN ('github', 'ollama', 'gemini', 'anthropic'))
);
