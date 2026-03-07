-- Migration 013: benchmark_results table
-- Stores LLM performance benchmark runs for comparing hardware tiers and models

CREATE TABLE IF NOT EXISTS benchmark_results (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_id       UUID         NOT NULL,          -- groups all tests in one benchmark run
  model        VARCHAR(100) NOT NULL,
  provider     VARCHAR(50)  NOT NULL,
  prompt_name  VARCHAR(50)  NOT NULL,          -- 'latency' | 'short_gen' | 'reasoning' | 'long_gen'
  prompt_label VARCHAR(100) NOT NULL,
  ttft_ms      INTEGER,                        -- time to first token (ms)
  total_ms     INTEGER      NOT NULL,          -- total response time (ms)
  chars_generated INTEGER   NOT NULL DEFAULT 0,
  tokens_generated INTEGER,                   -- from Ollama eval_count (exact) or estimated
  tokens_per_second NUMERIC(8,2),
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_benchmark_results_user_id   ON benchmark_results(user_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_results_run_id    ON benchmark_results(run_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_results_created   ON benchmark_results(created_at DESC);
