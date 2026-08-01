-- Move derived vectors from the retired GitHub Models space to embeddinggemma.
-- Source content is preserved; incompatible vectors are cleared for reindexing.

DROP FUNCTION IF EXISTS search_document_chunks(vector, uuid, double precision, integer, text);
DROP FUNCTION IF EXISTS search_document_chunks(vector, uuid, double precision, integer);
DROP FUNCTION IF EXISTS search_similar_tracks(vector, text[], integer);

DROP INDEX IF EXISTS idx_document_chunks_embedding;
DROP INDEX IF EXISTS idx_spotify_tracks_embedding;

UPDATE document_chunks SET embedding = NULL WHERE embedding IS NOT NULL;
UPDATE spotify_tracks SET embedding = NULL WHERE embedding IS NOT NULL;

ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(768);
ALTER TABLE spotify_tracks ALTER COLUMN embedding TYPE vector(768);

CREATE INDEX idx_document_chunks_embedding
  ON document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_spotify_tracks_embedding
  ON spotify_tracks USING hnsw (embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION search_document_chunks(
  query_embedding vector(768),
  search_user_id uuid,
  match_threshold double precision DEFAULT 0.5,
  match_count integer DEFAULT 5,
  search_domain_slug text DEFAULT NULL
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  content text,
  distance double precision,
  metadata jsonb,
  document_filename text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    (dc.embedding <=> query_embedding),
    dc.metadata,
    d.filename
  FROM document_chunks dc
  JOIN documents d ON dc.document_id = d.id
  WHERE d.status = 'completed'
    AND d.uploaded_by = search_user_id
    AND dc.embedding IS NOT NULL
    AND (search_domain_slug IS NULL OR d.domain_slug = search_domain_slug)
    AND (dc.embedding <=> query_embedding) < match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION search_similar_tracks(
  query_embedding vector(768),
  exclude_ids text[],
  match_count integer DEFAULT 50
)
RETURNS TABLE (track_id text, distance double precision)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT st.id, (st.embedding <=> query_embedding)
  FROM spotify_tracks st
  WHERE st.embedding IS NOT NULL
    AND NOT (st.id = ANY(exclude_ids))
  ORDER BY st.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE TABLE IF NOT EXISTS embedding_runtime_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  provider text NOT NULL,
  model text NOT NULL,
  dimensions integer NOT NULL CHECK (dimensions > 0),
  version text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

INSERT INTO embedding_runtime_state
  (singleton, provider, model, dimensions, version, updated_at)
VALUES
  (true, 'ollama', 'embeddinggemma', 768, 'ollama:embeddinggemma:v1', NOW())
ON CONFLICT (singleton) DO UPDATE SET
  provider = EXCLUDED.provider,
  model = EXCLUDED.model,
  dimensions = EXCLUDED.dimensions,
  version = EXCLUDED.version,
  updated_at = EXCLUDED.updated_at;

