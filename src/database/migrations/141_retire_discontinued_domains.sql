-- Migration 141: retire domains whose code was removed in PR #66
-- (design, space, learn, robot-assistant, recipes, finance, write).
-- A domain row is deleted when nothing still points at it by slug; otherwise it
-- is deactivated so the history it owns (conversations, documents, jobs) stays readable.
-- FK cascades on delete: user_domain_access, user_domain_model_settings,
-- domain_rate_limit_settings (CASCADE); agent_runs.domain_slug (SET NULL).

DO $$
DECLARE
  retired TEXT[] := ARRAY['design', 'space', 'learn', 'robot-assistant', 'recipes', 'finance', 'write'];
  s TEXT;
  referenced BOOLEAN;
BEGIN
  -- Bindings to the retired system skills are meaningless without the domain.
  DELETE FROM domain_skill_defaults WHERE domain_slug = ANY(retired);

  FOREACH s IN ARRAY retired LOOP
    -- Slug-only columns (no FK) that hold user data.
    SELECT EXISTS (SELECT 1 FROM chat_conversations     WHERE domain_slug = s)
        OR EXISTS (SELECT 1 FROM conversation_summaries WHERE domain_slug = s)
        OR EXISTS (SELECT 1 FROM documents              WHERE domain_slug = s)
        OR EXISTS (SELECT 1 FROM scheduled_jobs         WHERE domain_slug = s)
      INTO referenced;

    IF referenced THEN
      UPDATE domains SET is_active = false WHERE slug = s;
    ELSE
      DELETE FROM domains WHERE slug = s;
    END IF;
  END LOOP;

  -- Pending invites for a retired domain can no longer be redeemed.
  DELETE FROM invite_tokens WHERE domain_slug = ANY(retired) AND used_at IS NULL;
END $$;

-- Retired system skills (fixed ids from migrations 075/078/082). Delete only when
-- nothing blocks it: previous_skill_id in conversation_active_skills and skill_usage
-- has no ON DELETE action. Other skill FKs cascade or set NULL.
DELETE FROM skills s
WHERE s.user_id IS NULL
  AND s.id IN ('c3d4e5f6-a7b8-9012-cdef-012345678903',  -- space
               'd4e5f6a7-b8c9-0123-def0-123456789004',  -- learn
               'e5f6a7b8-c9d0-1234-ef01-234567890005')  -- robot-assistant
  AND NOT EXISTS (SELECT 1 FROM conversation_active_skills x WHERE x.previous_skill_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM skill_usage u WHERE u.previous_skill_id = s.id);

-- Notes is a live core domain (notes actions, connectors, knowledge search all
-- call requireDomainAccess('notes')), but 054 created it inactive, which locks
-- non-admin users out because domain access requires is_active = true.
UPDATE domains SET is_active = true WHERE slug = 'notes';

-- Compact sort_order after the removals, keeping the existing relative order.
UPDATE domains d
SET sort_order = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, created_at, slug) AS rn
  FROM domains
) sub
WHERE d.id = sub.id
  AND d.sort_order IS DISTINCT FROM sub.rn;
