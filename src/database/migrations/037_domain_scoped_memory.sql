-- Add domain_slug to conversation_summaries (memories)
ALTER TABLE conversation_summaries ADD COLUMN IF NOT EXISTS domain_slug TEXT;
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_domain ON conversation_summaries(user_id, domain_slug);

-- Migrate existing summaries to 'chat' domain
UPDATE conversation_summaries SET domain_slug = 'chat' WHERE domain_slug IS NULL;

-- Add domain_slug to documents (RAG)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS domain_slug TEXT;
CREATE INDEX IF NOT EXISTS idx_documents_domain ON documents(uploaded_by, domain_slug);

-- Migrate existing documents to 'chat' domain
UPDATE documents SET domain_slug = 'chat' WHERE domain_slug IS NULL;

-- Add domain_slug to scheduled_jobs (tasks)
ALTER TABLE scheduled_jobs ADD COLUMN IF NOT EXISTS domain_slug TEXT DEFAULT 'chat';
UPDATE scheduled_jobs SET domain_slug = 'chat' WHERE domain_slug IS NULL;

-- Per-domain user instructions (replaces global system_message for domain context)
CREATE TABLE IF NOT EXISTS user_domain_instructions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain_slug TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, domain_slug)
);

CREATE INDEX IF NOT EXISTS idx_user_domain_instructions_user ON user_domain_instructions(user_id, domain_slug);

-- Migrate existing system_message to user_domain_instructions for domain 'chat'
INSERT INTO user_domain_instructions (user_id, domain_slug, content)
SELECT us.user_id, 'chat', us.system_message
FROM user_settings us
WHERE us.system_message IS NOT NULL
  AND us.system_message != ''
  AND us.system_message != 'You are a helpful AI assistant.'
ON CONFLICT (user_id, domain_slug) DO NOTHING;

-- Update search_document_chunks to support optional domain filtering
CREATE OR REPLACE FUNCTION search_document_chunks(
  query_embedding vector(1536),
  search_user_id uuid,
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5,
  search_domain_slug text DEFAULT NULL
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
    AND (search_domain_slug IS NULL OR d.domain_slug = search_domain_slug)
    AND (dc.embedding <=> query_embedding) < match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
