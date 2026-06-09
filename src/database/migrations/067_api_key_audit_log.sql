CREATE TABLE IF NOT EXISTS api_key_audit_log (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  scope VARCHAR(10) NOT NULL CHECK (scope IN ('user', 'system')),
  key_name VARCHAR(100) NOT NULL,
  action VARCHAR(10) NOT NULL CHECK (action IN ('set', 'cleared')),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_key_audit_log_changed_at ON api_key_audit_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_key_audit_log_user_id ON api_key_audit_log(user_id);
