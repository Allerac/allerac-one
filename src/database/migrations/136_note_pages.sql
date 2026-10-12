-- Notion-lite pages: notes form a per-user tree.
-- parent_id uses ON DELETE SET NULL so deleting a page never deletes its
-- subtree; children are promoted to the root instead. Cross-user parents and
-- cycles are rejected by the application layer (NotesService.moveNote).

ALTER TABLE user_notes ADD COLUMN IF NOT EXISTS parent_id UUID;
ALTER TABLE user_notes ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_notes ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE user_notes ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_notes_parent_id_fkey') THEN
    ALTER TABLE user_notes
      ADD CONSTRAINT user_notes_parent_id_fkey
      FOREIGN KEY (parent_id) REFERENCES user_notes(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_notes_parent_not_self') THEN
    ALTER TABLE user_notes
      ADD CONSTRAINT user_notes_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_notes_tree ON user_notes (user_id, parent_id, position);

-- Explicit, user-provenance links parsed from [[Page]] references on save.
-- Only note -> note links are written for now; tickets stay separate.
CREATE TABLE IF NOT EXISTS knowledge_links (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_type  TEXT NOT NULL,
  from_id    UUID NOT NULL,
  to_type    TEXT NOT NULL,
  to_id      UUID NOT NULL,
  relation   TEXT NOT NULL DEFAULT 'links_to',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, from_type, from_id, to_type, to_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_links_target ON knowledge_links (user_id, to_type, to_id);
