-- Mark which documents are projections of another source.
-- Notes are embedded through a hidden document row; until now the only marker
-- was domain_slug = 'notes', so note-backed documents leaked into the Knowledge
-- graph and the Documents list. source_type/source_id make that explicit.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'upload';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_source_type_check'
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_source_type_check
      CHECK (source_type IN ('upload', 'crawler', 'note'));
  END IF;
END $$;

-- Backfill: documents linked from a note.
UPDATE documents d
SET source_type = 'note', source_id = n.id
FROM user_notes n
WHERE n.document_id = d.id
  AND (d.source_type <> 'note' OR d.source_id IS DISTINCT FROM n.id);

-- Backfill: orphaned note documents (note row gone or link cleared).
UPDATE documents
SET source_type = 'note'
WHERE domain_slug = 'notes' AND source_type = 'upload';

-- Backfill: crawler documents (their source id lives in crawler_documents).
UPDATE documents d
SET source_type = 'crawler'
FROM crawler_documents cd
WHERE cd.document_id = d.id AND d.source_type = 'upload';

CREATE INDEX IF NOT EXISTS idx_documents_user_source_type
  ON documents (uploaded_by, source_type);
