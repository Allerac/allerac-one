-- Health MFA sessions
-- Temporary storage for in-flight Garmin MFA flows (10-minute TTL).
-- Replaces mfa_sessions table from allerac-health.

CREATE TABLE IF NOT EXISTS health_mfa_sessions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  garmin_email          VARCHAR(255) NOT NULL,
  session_data_encrypted TEXT       NOT NULL,  -- encrypted garminconnect intermediate state
  expires_at            TIMESTAMP   NOT NULL,
  created_at            TIMESTAMP   NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- Used by cleanup queries to remove expired sessions
CREATE INDEX IF NOT EXISTS idx_health_mfa_sessions_expires_at
  ON health_mfa_sessions (expires_at);
