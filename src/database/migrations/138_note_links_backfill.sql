-- Tracks when a note's [[Page]] links were last parsed into knowledge_links.
-- NULL means "never parsed" (notes written before Phase 1); a throttled
-- startup job (note-links-backfill.ts) parses those once.

ALTER TABLE user_notes ADD COLUMN IF NOT EXISTS links_synced_at TIMESTAMPTZ;

-- Note links whose source or target note no longer exists (e.g. deleted
-- before link cleanup existed) would only be dead weight.
DELETE FROM knowledge_links l
WHERE l.from_type = 'note'
  AND NOT EXISTS (SELECT 1 FROM user_notes n WHERE n.id = l.from_id AND n.user_id = l.user_id);

DELETE FROM knowledge_links l
WHERE l.to_type = 'note'
  AND NOT EXISTS (SELECT 1 FROM user_notes n WHERE n.id = l.to_id AND n.user_id = l.user_id);
