-- Migration 142: service principals for Unit-to-Unit federation (roadmap P0).
-- A service principal is a non-human identity (one per peer Unit). Its keys live
-- in control_api_keys with principal_id set, and act as acting_user_id.

CREATE TABLE IF NOT EXISTS service_principals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(32) NOT NULL DEFAULT 'peer',
  name VARCHAR(100) NOT NULL UNIQUE,
  peer_url TEXT,
  acting_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE control_api_keys
  ADD COLUMN IF NOT EXISTS principal_id UUID
    REFERENCES service_principals(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_control_api_keys_principal
  ON control_api_keys(principal_id)
  WHERE principal_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS control_api_key_usage (
  id BIGSERIAL PRIMARY KEY,
  key_id UUID NOT NULL REFERENCES control_api_keys(id) ON DELETE CASCADE,
  principal_id UUID REFERENCES service_principals(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  allowed BOOLEAN NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_control_api_key_usage_principal_at
  ON control_api_key_usage(principal_id, at DESC);
