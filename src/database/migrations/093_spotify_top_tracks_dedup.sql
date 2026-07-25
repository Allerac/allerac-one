-- Top-tracks windows (top_short/top_medium/top_long) always have played_at =
-- NULL — they're ranked snapshots, not timestamped events. Postgres treats
-- NULL as distinct from NULL in UNIQUE (user_id, track_id, source, played_at),
-- so ON CONFLICT DO NOTHING never caught repeat syncs and every sync added a
-- fresh duplicate row per track, making "Top Tracks" show the same track
-- 2-3x. Recently-played/saved-tracks/playlist rows are unaffected — their
-- played_at is a real, stable Spotify timestamp.

-- Keep only the most recently synced row per (user, track, window).
DELETE FROM spotify_listening_history a
USING spotify_listening_history b
WHERE a.played_at IS NULL
  AND b.played_at IS NULL
  AND a.user_id = b.user_id
  AND a.track_id = b.track_id
  AND a.source = b.source
  AND (a.created_at, a.id) < (b.created_at, b.id);

-- Enforce it going forward: one row per (user, track, window); re-syncing
-- updates the rank in place instead of inserting a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_spotify_listening_history_top_rank_unique
  ON spotify_listening_history (user_id, track_id, source)
  WHERE played_at IS NULL;
