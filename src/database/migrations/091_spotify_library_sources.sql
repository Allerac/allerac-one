-- Adds Liked Songs and playlist tracks as additional listening-history
-- sources, alongside recently-played and top-tracks windows.

ALTER TABLE spotify_listening_history DROP CONSTRAINT IF EXISTS spotify_listening_history_source_check;
ALTER TABLE spotify_listening_history ADD CONSTRAINT spotify_listening_history_source_check
  CHECK (source IN ('recently_played', 'top_short', 'top_medium', 'top_long', 'saved_tracks', 'playlist'));

ALTER TABLE spotify_listening_history ADD COLUMN IF NOT EXISTS playlist_name TEXT;
