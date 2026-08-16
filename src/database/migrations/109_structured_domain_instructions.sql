ALTER TABLE user_domain_instructions
ADD COLUMN IF NOT EXISTS base_content TEXT NOT NULL DEFAULT '';

UPDATE user_domain_instructions
SET base_content = content
WHERE base_content = '';

CREATE TABLE IF NOT EXISTS domain_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain_slug TEXT NOT NULL,
  instruction TEXT NOT NULL,
  normalized_key TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('explicit', 'distilled')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  evidence TEXT,
  source_conversation_id UUID REFERENCES chat_conversations(id) ON DELETE SET NULL,
  source_summary_id UUID REFERENCES conversation_summaries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_instructions_active_unique
ON domain_instructions(user_id, domain_slug, normalized_key)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_domain_instructions_active
ON domain_instructions(user_id, domain_slug, created_at)
WHERE status = 'active';
