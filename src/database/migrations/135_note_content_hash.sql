-- Hash of the text last embedded for a note (title + content), so note saves
-- can skip re-embedding when nothing searchable changed. NULL means "not known
-- to be indexed"; the next save of such a note re-embeds it once.

ALTER TABLE user_notes ADD COLUMN IF NOT EXISTS content_hash TEXT;
