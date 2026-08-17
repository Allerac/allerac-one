-- Allow 'openai' as a scheduled job LLM provider, and seed pricing for the
-- OpenAI direct models (estimates — adjust via the admin pricing panel).
ALTER TABLE scheduled_jobs DROP CONSTRAINT IF EXISTS scheduled_jobs_llm_selection_check;
ALTER TABLE scheduled_jobs ADD CONSTRAINT scheduled_jobs_llm_selection_check CHECK (
  (llm_model IS NULL AND llm_provider IS NULL)
  OR
  (llm_model IS NOT NULL AND llm_provider IN ('github', 'ollama', 'gemini', 'anthropic', 'openai'))
);

INSERT INTO model_pricing (model_id, provider, display_name, input_price_per_1m, output_price_per_1m) VALUES
  ('gpt-5.6-luna', 'openai', 'GPT-5.6 Luna', 0.250000,  1.000000),
  ('gpt-5.6-sol',  'openai', 'GPT-5.6 Sol',  3.000000, 12.000000)
ON CONFLICT (model_id) DO NOTHING;
