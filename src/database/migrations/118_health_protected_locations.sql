-- User-level privacy zones (docs/roadmap/health-detailed-activities.md,
-- "Privacy and security"): not activity-scoped. Coordinates are encrypted
-- (see src/app/services/crypto/encryption.service.ts) so the precise
-- location doesn't appear in ordinary queries/backups.
CREATE TABLE IF NOT EXISTS health_protected_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT,
  location_encrypted TEXT NOT NULL,
  radius_meters NUMERIC NOT NULL CHECK (radius_meters > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_protected_locations_user
  ON health_protected_locations (user_id);
