-- Per-connection data mode for Garmin: 'cached' persists synced data for the
-- dashboard/trends (existing behavior, default so current installs are
-- unaffected); 'proxy' never persists anything — reads are always live.
-- Chosen once at first connect (src/app/actions/health.ts connectGarmin);
-- reconnecting does not change an existing connection's mode.
ALTER TABLE garmin_credentials
  ADD COLUMN IF NOT EXISTS data_mode TEXT NOT NULL DEFAULT 'cached'
  CHECK (data_mode IN ('cached', 'proxy'));
