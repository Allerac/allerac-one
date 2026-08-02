ALTER TABLE user_domain_instructions
ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS last_writer TEXT NOT NULL DEFAULT 'user'
  CHECK (last_writer IN ('user', 'distiller'));

CREATE TABLE IF NOT EXISTS user_domain_instruction_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain_slug TEXT NOT NULL,
  revision BIGINT NOT NULL,
  content TEXT NOT NULL,
  writer TEXT NOT NULL CHECK (writer IN ('user', 'distiller')),
  source_summary_id UUID REFERENCES conversation_summaries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, domain_slug, revision)
);

CREATE INDEX IF NOT EXISTS idx_instruction_versions_domain
ON user_domain_instruction_versions(user_id, domain_slug, revision DESC);

INSERT INTO user_domain_instruction_versions
  (user_id, domain_slug, revision, content, writer)
SELECT user_id, domain_slug, revision, content, last_writer
FROM user_domain_instructions
ON CONFLICT (user_id, domain_slug, revision) DO NOTHING;
