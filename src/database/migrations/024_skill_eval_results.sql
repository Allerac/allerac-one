-- Skill quality evaluation results (CI/CD for skills)
CREATE TABLE IF NOT EXISTS skill_eval_results (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_id       UUID NOT NULL,
  skill_name   VARCHAR(100) NOT NULL,
  skill_version VARCHAR(20),
  model        VARCHAR(100),
  provider     VARCHAR(50),
  case_id      VARCHAR(100) NOT NULL,
  case_description TEXT,
  prompt       TEXT NOT NULL,
  response     TEXT,
  criteria     JSONB NOT NULL DEFAULT '[]',  -- [{label, pass, reason}]
  score_pct    INTEGER,                       -- 0-100
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_eval_results_user_id    ON skill_eval_results(user_id);
CREATE INDEX IF NOT EXISTS idx_skill_eval_results_run_id     ON skill_eval_results(run_id);
CREATE INDEX IF NOT EXISTS idx_skill_eval_results_skill_name ON skill_eval_results(skill_name);
CREATE INDEX IF NOT EXISTS idx_skill_eval_results_created_at ON skill_eval_results(created_at DESC);
