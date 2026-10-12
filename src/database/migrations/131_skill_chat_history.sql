-- Persists the Domain Configuration "Skill Assistant" chat (previously only
-- held in React state, lost on skill switch or reload) and records every
-- change actually applied to a skill's system prompt. This lets an admin:
--   1. Reopen a skill's prompt-engineering conversation later.
--   2. Browse applied changes across ALL skills/domains to spot an
--      improvement made to one skill (e.g. "refuse programming requests")
--      that's worth replicating on others.

CREATE TABLE IF NOT EXISTS skill_chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id        UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain_slug     VARCHAR(50) NOT NULL,
  role            VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  changes         JSONB,        -- proposed changes on an assistant turn: [{old,new,rationale}]
  applied_changes JSONB,        -- subset of `changes` the admin actually applied
  applied_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_chat_messages_skill
  ON skill_chat_messages(skill_id, created_at);

-- Powers the cross-skill "recent improvements" feed (admin's own applied
-- changes, newest first) without scanning every message.
CREATE INDEX IF NOT EXISTS idx_skill_chat_messages_applied
  ON skill_chat_messages(user_id, applied_at DESC)
  WHERE applied_at IS NOT NULL;
