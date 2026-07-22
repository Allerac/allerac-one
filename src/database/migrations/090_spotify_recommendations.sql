-- Cached recommendation batch, recomputed on each sync. Also defines the
-- pgvector similarity search function used by the recommendation service,
-- mirroring search_document_chunks() from init.sql.

CREATE TABLE IF NOT EXISTS spotify_recommendations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id      TEXT NOT NULL REFERENCES spotify_tracks(id) ON DELETE CASCADE,
  score         FLOAT NOT NULL,
  reason        TEXT,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_spotify_recommendations_user_score
  ON spotify_recommendations(user_id, score DESC);

CREATE OR REPLACE FUNCTION search_similar_tracks(
  query_embedding vector(1536),
  exclude_ids text[],
  match_count int DEFAULT 50
) RETURNS TABLE (track_id text, distance float)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT st.id, (st.embedding <=> query_embedding) AS distance
  FROM spotify_tracks st
  WHERE st.embedding IS NOT NULL
    AND NOT (st.id = ANY(exclude_ids))
  ORDER BY st.embedding <=> query_embedding
  LIMIT match_count;
END; $$;
