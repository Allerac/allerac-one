CREATE TABLE IF NOT EXISTS user_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  title       TEXT,
  content     TEXT NOT NULL,
  tags        TEXT[]   NOT NULL DEFAULT '{}',
  source      TEXT     NOT NULL DEFAULT 'chat',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notes_user_id    ON user_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notes_created_at ON user_notes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notes_tags       ON user_notes USING GIN(tags);

INSERT INTO domains (slug, display_name, is_active, sort_order)
VALUES ('notes', 'Notes', false, 99)
ON CONFLICT (slug) DO NOTHING;
