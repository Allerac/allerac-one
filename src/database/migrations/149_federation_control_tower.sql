-- Migration 149: Control Tower heartbeats (federation P4d).
--
-- Home side only. The heartbeat job stores 7 days of liveness beats per peer
-- and, on federation_peers, the current beat state plus the latest validated
-- status snapshot from the peer (metadata only; overwritten on every beat, so
-- there is no history of remote activity).

CREATE TABLE IF NOT EXISTS federation_peer_heartbeats (
  id BIGSERIAL PRIMARY KEY,
  peer_id UUID NOT NULL REFERENCES federation_peers(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ok BOOLEAN NOT NULL,
  latency_ms INT,
  app_version VARCHAR(64),
  error_code VARCHAR(64)
);
CREATE INDEX IF NOT EXISTS idx_federation_peer_heartbeats_peer_at
  ON federation_peer_heartbeats (peer_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_federation_peer_heartbeats_at
  ON federation_peer_heartbeats (at);

ALTER TABLE federation_peers
  ADD COLUMN IF NOT EXISTS beat_state VARCHAR(16) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS consecutive_misses INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_beat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_latency_ms INT,
  ADD COLUMN IF NOT EXISTS last_beat_error VARCHAR(64),
  ADD COLUMN IF NOT EXISTS status_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS status_snapshot_at TIMESTAMPTZ;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'federation_peers_beat_state_check') THEN
    ALTER TABLE federation_peers
      ADD CONSTRAINT federation_peers_beat_state_check
      CHECK (beat_state IN ('unknown', 'online', 'degraded', 'offline'));
  END IF;
END $$;

-- The status endpoint reads the last 24h of inbound and outbound asks by time.
CREATE INDEX IF NOT EXISTS idx_federation_audit_capability_at
  ON federation_audit_log (capability, at DESC);
