CREATE TABLE IF NOT EXISTS user_domain_model_settings (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain_slug VARCHAR(100) NOT NULL REFERENCES domains(slug) ON DELETE CASCADE,
  model_id VARCHAR(255),
  fallback_model_id VARCHAR(255),
  temperature NUMERIC(3,2),
  max_tokens INTEGER,
  local_only BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, domain_slug),
  CHECK (temperature IS NULL OR (temperature >= 0 AND temperature <= 2)),
  CHECK (max_tokens IS NULL OR (max_tokens >= 128 AND max_tokens <= 32768))
);
