-- Strava OAuth connection and provider provenance for Health activities.
CREATE TABLE IF NOT EXISTS strava_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  athlete_id BIGINT,
  athlete_name TEXT,
  avatar_url TEXT,
  access_token_encrypted TEXT NOT NULL DEFAULT '',
  refresh_token_encrypted TEXT NOT NULL DEFAULT '',
  access_expires_at TIMESTAMPTZ,
  scopes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id),
  UNIQUE (athlete_id)
);

CREATE TABLE IF NOT EXISTS health_activity_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id VARCHAR(255) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  provider_activity_id VARCHAR(255) NOT NULL,
  provider_account_id VARCHAR(255),
  external_id TEXT,
  upload_id TEXT,
  visibility TEXT,
  source_device TEXT,
  summary_raw JSONB,
  details_raw JSONB,
  mapper_version INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (user_id, activity_id)
    REFERENCES health_activities(user_id, activity_id) ON DELETE CASCADE,
  UNIQUE (user_id, provider, provider_activity_id)
);

CREATE INDEX IF NOT EXISTS idx_health_activity_sources_activity
  ON health_activity_sources(user_id, activity_id);

-- Existing Garmin activities become explicit sources. The original raw_data is
-- retained as evidence and no activity identifier changes.
INSERT INTO health_activity_sources (
  user_id, activity_id, provider, provider_activity_id, summary_raw
)
SELECT user_id, activity_id, 'garmin', COALESCE(provider_activity_id, activity_id), raw_data
FROM health_activities
WHERE COALESCE(provider, 'garmin') = 'garmin'
ON CONFLICT (user_id, provider, provider_activity_id) DO NOTHING;
