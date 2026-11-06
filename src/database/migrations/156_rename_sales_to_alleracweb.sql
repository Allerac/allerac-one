-- Migration 156: rename the public 'sales' domain to 'alleracweb'.
-- The allerac.ai website chatbot is now called "alleracweb" everywhere
-- (profile, module, route, skill). Earlier migrations (123/128/129/145) are left
-- untouched; this one moves the existing data over.
--
-- domains.slug is referenced by FKs without ON UPDATE CASCADE
-- (user_domain_model_settings, agent_runs, domain_rate_limit_settings), so the
-- slug cannot be updated in place. Instead: create the 'alleracweb' row from the
-- 'sales' row, repoint every reference (by slug and by id), then delete 'sales'.
-- The bot account, its API keys and its conversations are kept; only their
-- domain reference changes.
--
-- Idempotent: no-op when 'sales' does not exist (fresh install, or already run).
-- If 'alleracweb' already exists too, rows are merged and 'alleracweb' wins on
-- conflicts.

DO $$
DECLARE
  old_id UUID;
  new_id UUID;
BEGIN
  SELECT id INTO old_id FROM domains WHERE slug = 'sales';
  IF old_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO domains (slug, display_name, is_active, sort_order)
  SELECT 'alleracweb', 'Allerac Web', d.is_active, d.sort_order
  FROM domains d WHERE d.id = old_id
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO new_id FROM domains WHERE slug = 'alleracweb';

  -- Access grants (by domain id). Covers the website bot account.
  INSERT INTO user_domain_access (user_id, domain_id, created_at)
  SELECT user_id, new_id, created_at FROM user_domain_access WHERE domain_id = old_id
  ON CONFLICT DO NOTHING;
  DELETE FROM user_domain_access WHERE domain_id = old_id;

  -- FK-by-slug tables.
  INSERT INTO user_domain_model_settings
    (user_id, domain_slug, model_id, fallback_model_id, temperature, max_tokens, local_only, created_at, updated_at)
  SELECT user_id, 'alleracweb', model_id, fallback_model_id, temperature, max_tokens, local_only, created_at, updated_at
  FROM user_domain_model_settings WHERE domain_slug = 'sales'
  ON CONFLICT DO NOTHING;
  DELETE FROM user_domain_model_settings WHERE domain_slug = 'sales';

  IF NOT EXISTS (SELECT 1 FROM domain_rate_limit_settings WHERE domain_slug = 'alleracweb') THEN
    UPDATE domain_rate_limit_settings SET domain_slug = 'alleracweb' WHERE domain_slug = 'sales';
  END IF;
  DELETE FROM domain_rate_limit_settings WHERE domain_slug = 'sales';

  UPDATE agent_runs SET domain_slug = 'alleracweb' WHERE domain_slug = 'sales';

  -- Slug-only columns (no FK, no uniqueness on the slug).
  UPDATE chat_conversations     SET domain_slug = 'alleracweb' WHERE domain_slug = 'sales'
    AND NOT (is_primary AND EXISTS (
      SELECT 1 FROM chat_conversations c2
      WHERE c2.is_primary AND c2.domain_slug = 'alleracweb'
        AND c2.user_id = chat_conversations.user_id
        AND c2.source IS NOT DISTINCT FROM chat_conversations.source
        AND c2.federation_principal_id IS NOT DISTINCT FROM chat_conversations.federation_principal_id));
  -- Any primary that would collide (only possible when both slugs already had
  -- one) is kept as a normal, non-primary conversation.
  UPDATE chat_conversations SET domain_slug = 'alleracweb', is_primary = false WHERE domain_slug = 'sales';

  UPDATE conversation_summaries SET domain_slug = 'alleracweb' WHERE domain_slug = 'sales';
  UPDATE documents              SET domain_slug = 'alleracweb' WHERE domain_slug = 'sales';
  UPDATE scheduled_jobs         SET domain_slug = 'alleracweb' WHERE domain_slug = 'sales';
  UPDATE invite_tokens          SET domain_slug = 'alleracweb' WHERE domain_slug = 'sales';
  UPDATE skill_chat_messages    SET domain_slug = 'alleracweb' WHERE domain_slug = 'sales';
  UPDATE user_domain_instruction_versions SET domain_slug = 'alleracweb' WHERE domain_slug = 'sales'
    AND NOT EXISTS (SELECT 1 FROM user_domain_instruction_versions v
                    WHERE v.domain_slug = 'alleracweb'
                      AND v.user_id = user_domain_instruction_versions.user_id
                      AND v.revision = user_domain_instruction_versions.revision);
  UPDATE domain_instructions    SET domain_slug = 'alleracweb' WHERE domain_slug = 'sales'
    AND NOT EXISTS (SELECT 1 FROM domain_instructions i
                    WHERE i.domain_slug = 'alleracweb'
                      AND i.user_id = domain_instructions.user_id
                      AND i.normalized_key = domain_instructions.normalized_key);
  UPDATE user_domain_instructions SET domain_slug = 'alleracweb' WHERE domain_slug = 'sales'
    AND NOT EXISTS (SELECT 1 FROM user_domain_instructions u
                    WHERE u.domain_slug = 'alleracweb' AND u.user_id = user_domain_instructions.user_id);
  UPDATE crawler_sources        SET domain_slug = 'alleracweb' WHERE domain_slug = 'sales';
  UPDATE user_settings          SET cli_domain_slug = 'alleracweb' WHERE cli_domain_slug = 'sales';
  UPDATE knowledge_semantic_index SET domain_slug = 'alleracweb' WHERE domain_slug = 'sales';

  -- Skill binding: point the domain at the same skill row (the loader rebinds
  -- it from skills/alleracweb.md on startup anyway).
  INSERT INTO domain_skill_defaults (domain_slug, skill_id)
  SELECT 'alleracweb', skill_id FROM domain_skill_defaults WHERE domain_slug = 'sales'
  ON CONFLICT (domain_slug) DO NOTHING;
  DELETE FROM domain_skill_defaults WHERE domain_slug = 'sales';

  -- Per-agent description on the Unit profile is keyed by domain slug.
  UPDATE unit_profile
  SET agent_descriptions = (agent_descriptions - 'sales')
        || jsonb_build_object('alleracweb', agent_descriptions -> 'sales')
  WHERE agent_descriptions ? 'sales' AND NOT agent_descriptions ? 'alleracweb';
  UPDATE unit_profile SET agent_descriptions = agent_descriptions - 'sales'
  WHERE agent_descriptions ? 'sales';

  -- Leftover rows that conflicted with existing 'alleracweb' rows go with the
  -- old domain.
  DELETE FROM user_domain_instruction_versions WHERE domain_slug = 'sales';
  DELETE FROM domain_instructions WHERE domain_slug = 'sales';
  DELETE FROM user_domain_instructions WHERE domain_slug = 'sales';

  DELETE FROM domains WHERE id = old_id;
END $$;

-- The system skill is upserted by source_file. Rename the existing row so the
-- loader updates it (same skill id, history and bindings) instead of creating a
-- new one next to an orphaned 'sales.md' row.
UPDATE skills
SET source_file = 'alleracweb.md', name = 'alleracweb'
WHERE is_system = true AND source_file = 'sales.md'
  AND NOT EXISTS (SELECT 1 FROM skills s2 WHERE s2.is_system = true AND s2.source_file = 'alleracweb.md');
