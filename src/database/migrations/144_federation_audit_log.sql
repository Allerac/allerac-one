-- Migration 144: federation audit log (roadmap P3).
-- One row per Unit-to-Unit call after pairing, in either direction.
-- Metadata only: never message content, answers, or keys.

CREATE TABLE IF NOT EXISTS federation_audit_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  direction VARCHAR(8) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  peer_id UUID REFERENCES federation_peers(id) ON DELETE SET NULL,
  principal_id UUID REFERENCES service_principals(id) ON DELETE SET NULL,
  -- Outbound: the local user who triggered the call. Inbound: the acting user.
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  capability VARCHAR(64) NOT NULL,
  target VARCHAR(100),
  outcome VARCHAR(16) NOT NULL CHECK (outcome IN ('ok', 'denied', 'error')),
  http_status INTEGER,
  error_code VARCHAR(64),
  duration_ms INTEGER,
  request_bytes INTEGER,
  response_bytes INTEGER
);

CREATE INDEX IF NOT EXISTS idx_federation_audit_peer_at
  ON federation_audit_log(peer_id, at DESC);

CREATE INDEX IF NOT EXISTS idx_federation_audit_at
  ON federation_audit_log(at DESC);
