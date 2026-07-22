-- Per-user listening signal pulled from Spotify: recently played events plus
-- the three "top tracks" windows (short/medium/long term). Together these
-- feed the taste-vector calculation in the recommendation service.

CREATE TABLE IF NOT EXISTS spotify_listening_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id    TEXT NOT NULL REFERENCES spotify_tracks(id) ON DELETE CASCADE,
  played_at   TIMESTAMPTZ,
  source      TEXT NOT NULL CHECK (source IN ('recently_played', 'top_short', 'top_medium', 'top_long')),
  rank        INTEGER, -- position within a top_* window, NULL for recently_played
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, track_id, source, played_at)
);

CREATE INDEX IF NOT EXISTS idx_spotify_listening_user_played
  ON spotify_listening_history(user_id, played_at DESC);

CREATE INDEX IF NOT EXISTS idx_spotify_listening_user_source
  ON spotify_listening_history(user_id, source);
