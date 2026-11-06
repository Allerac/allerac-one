-- Migration 143: federation peers and pairing (roadmap P2).
-- One row per pairing attempt with another Allerac Unit. Inbound access for the
-- peer is a P0 service principal; the key the peer issued to us is stored
-- encrypted (application-level, ENCRYPTION_KEY).

CREATE TABLE IF NOT EXISTS federation_peers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_name VARCHAR(63) NOT NULL,
  display_name VARCHAR(100),
  origin TEXT NOT NULL,
  protocol_version VARCHAR(16),
  initiated_by_us BOOLEAN NOT NULL,
  status VARCHAR(24) NOT NULL
    CHECK (status IN ('pending_outbound', 'pending_inbound', 'active', 'rejected', 'expired', 'revoked')),
  inbound_principal_id UUID REFERENCES service_principals(id) ON DELETE SET NULL,
  inbound_capabilities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  outbound_capabilities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  outbound_key_encrypted TEXT,
  outbound_key_prefix VARCHAR(32),
  nonce_local TEXT,
  nonce_remote TEXT,
  -- Initiator keeps a hash of the one-time pairing secret; responder keeps the
  -- secret encrypted until it completes the handshake. Both are cleared after.
  pairing_secret_hash TEXT,
  pairing_secret_encrypted TEXT,
  remote_request_id UUID,
  request_ip TEXT,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_federation_peers_open_origin
  ON federation_peers(origin)
  WHERE status IN ('pending_outbound', 'pending_inbound', 'active');

CREATE INDEX IF NOT EXISTS idx_federation_peers_status
  ON federation_peers(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_federation_peers_principal
  ON federation_peers(inbound_principal_id)
  WHERE inbound_principal_id IS NOT NULL;
