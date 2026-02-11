-- Migration: Update search_document_chunks function to filter by user
-- Run this on existing databases to apply the user filtering fix

-- Drop the old function (it has different parameters)
DROP FUNCTION IF EXISTS search_document_chunks(vector(1536), float, int);

-- Create the new function with user filtering
CREATE OR REPLACE FUNCTION search_document_chunks(
  query_embedding vector(1536),
  search_user_id uuid,
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  content text,
  distance float,
  metadata jsonb,
  document_filename text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id as chunk_id,
    dc.document_id,
    dc.content,
    (dc.embedding <=> query_embedding) as distance,
    dc.metadata,
    d.filename as document_filename
  FROM document_chunks dc
  JOIN documents d ON dc.document_id = d.id
  WHERE d.status = 'completed'
    AND d.uploaded_by = search_user_id
    AND (dc.embedding <=> query_embedding) < match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
