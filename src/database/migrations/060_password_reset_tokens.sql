CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);

INSERT INTO system_settings (key, value_encrypted, updated_at) VALUES ('resend_api_key',    '', NOW()) ON CONFLICT (key) DO NOTHING;
INSERT INTO system_settings (key, value_encrypted, updated_at) VALUES ('resend_from_email', '', NOW()) ON CONFLICT (key) DO NOTHING;
