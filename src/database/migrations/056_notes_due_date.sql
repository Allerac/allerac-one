ALTER TABLE user_notes ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_notes_due_date ON user_notes(user_id, due_date)
  WHERE due_date IS NOT NULL;
