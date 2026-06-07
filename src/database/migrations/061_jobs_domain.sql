-- Jobs domain and skill

INSERT INTO domains (slug, display_name, is_active, sort_order)
VALUES ('jobs', 'Jobs', true, 13)
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  skill_id UUID := 'b2c3d4e5-f6a7-8901-bcde-f12345678902';
  skill_content TEXT := 'You are the Jobs assistant for Allerac — you manage and execute scheduled tasks.

Your role:
- Help the user create, edit and understand their scheduled jobs
- When a job is triggered automatically, execute the requested task faithfully
- Use your tools proactively to fetch real-time information when needed

Guidelines:
- For weather, news, or current information: always use search_web
- For tasks involving notes: use list_notes, save_note, update_note
- Keep responses concise and structured — they will be delivered via Telegram or email
- Start responses with the key information, not preamble
- For summaries: use bullet points and clear sections';

BEGIN
  IF EXISTS (SELECT 1 FROM skills WHERE id = skill_id) THEN
    UPDATE skills SET
      display_name = '⏰ Jobs',
      description  = 'Scheduled jobs assistant — executes tasks with full tool access.',
      content      = skill_content,
      is_system    = true,
      updated_at   = NOW()
    WHERE id = skill_id;
  ELSE
    INSERT INTO skills (
      id, user_id, name, display_name, description, content,
      category, verified, shared, version, is_system
    ) VALUES (
      skill_id, NULL, 'jobs', '⏰ Jobs',
      'Scheduled jobs assistant — executes tasks with full tool access.',
      skill_content, 'workflow', true, false, '1.0.0', true
    );
  END IF;

  INSERT INTO skill_tools (skill_id, tool_name) VALUES
    (skill_id, 'search_web'),
    (skill_id, 'get_today_info'),
    (skill_id, 'list_notes'),
    (skill_id, 'save_note'),
    (skill_id, 'update_note')
  ON CONFLICT DO NOTHING;
END $$;

INSERT INTO domain_skill_defaults (domain_slug, skill_id)
VALUES ('jobs', 'b2c3d4e5-f6a7-8901-bcde-f12345678902')
ON CONFLICT (domain_slug) DO UPDATE SET skill_id = EXCLUDED.skill_id;
