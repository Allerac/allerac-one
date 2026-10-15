-- Shared semantic index for knowledge sources that have no document chunks of
-- their own. Phase 3 indexes memories (conversation_summaries) here; notes and
-- uploaded/crawled documents stay in document_chunks (option (a) of the
-- knowledge plan) and are searched alongside it by KnowledgeSearchService.
--
-- Tickets are deliberately NOT a valid source_type: they must never be
-- indexed for retrieval. The CHECK constraint enforces that at the database.
--
-- The index is derived data: every row can be rebuilt from its source, and the
-- background sweep (memory-index-sweep.ts) re-embeds rows whose content_hash
-- or embedding_version no longer matches.

CREATE TABLE IF NOT EXISTS knowledge_semantic_index (
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type        TEXT NOT NULL,
  source_id          UUID NOT NULL,
  chunk_index        INTEGER NOT NULL DEFAULT 0,
  content            TEXT NOT NULL,
  domain_slug        TEXT,
  embedding          vector(768) NOT NULL,
  embedding_provider TEXT NOT NULL,
  embedding_model    TEXT NOT NULL,
  embedding_version  TEXT NOT NULL,
  content_hash       TEXT NOT NULL,
  indexed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, source_type, source_id, chunk_index)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_semantic_index_source_type_check'
  ) THEN
    ALTER TABLE knowledge_semantic_index
      ADD CONSTRAINT knowledge_semantic_index_source_type_check
      CHECK (source_type IN ('memory'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_knowledge_semantic_index_embedding
  ON knowledge_semantic_index USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_knowledge_semantic_index_source
  ON knowledge_semantic_index (source_type, source_id);

-- Index rows must not outlive their memory, whichever code path deletes it.
CREATE OR REPLACE FUNCTION knowledge_semantic_index_drop_memory()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM knowledge_semantic_index
  WHERE source_type = 'memory' AND source_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_knowledge_semantic_index_drop_memory ON conversation_summaries;
CREATE TRIGGER trg_knowledge_semantic_index_drop_memory
  AFTER DELETE ON conversation_summaries
  FOR EACH ROW EXECUTE FUNCTION knowledge_semantic_index_drop_memory();
