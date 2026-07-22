-- Local cache of Spotify track metadata plus a text embedding used for
-- content-based similarity (Spotify's own /audio-features and /recommendations
-- endpoints are no longer available to new API apps, so similarity is computed
-- from track/artist/genre text instead of acoustic features).

CREATE TABLE IF NOT EXISTS spotify_tracks (
  id               TEXT PRIMARY KEY, -- Spotify track id
  name             TEXT NOT NULL,
  artists          JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ id, name }]
  album_name       TEXT,
  album_image_url  TEXT,
  genres           TEXT[] NOT NULL DEFAULT '{}',
  popularity       INTEGER,
  preview_url      TEXT,
  external_url     TEXT,
  embedding        vector(1536),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spotify_tracks_embedding
  ON spotify_tracks USING hnsw (embedding vector_cosine_ops);
