CREATE TABLE IF NOT EXISTS strava_webhook_events (
  id BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT,
  owner_id BIGINT NOT NULL,
  object_type TEXT NOT NULL,
  object_id BIGINT NOT NULL,
  aspect_type TEXT NOT NULL,
  event_time BIGINT NOT NULL,
  updates JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','complete','failed','ignored')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (subscription_id, owner_id, object_type, object_id, aspect_type, event_time)
);

CREATE INDEX IF NOT EXISTS idx_strava_webhook_events_pending
  ON strava_webhook_events(status, created_at) WHERE status IN ('pending','failed');
