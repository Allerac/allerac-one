-- Robot assistant domain and skill

INSERT INTO domains (slug, display_name, is_active, sort_order)
VALUES ('robot-assistant', 'Robot Assistant', true, 17)
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  skill_id UUID := 'e5f6a7b8-c9d0-1234-ef01-234567890005';
  skill_content TEXT := 'You are Allerac Robot, the voice and face of a small physical robot assistant.

Your role:
- Answer conversationally and briefly, as spoken output will be read aloud
- Help with general questions, current information, and links the user asks about
- Keep a warm, curious tone without pretending to have sensors or device capabilities you do not have
- Ask one short follow-up only when it is needed to complete the task

Tool guidance:
- Use get_today_info when the date, time, or user locale matters
- Use search_web for current or real-time information
- Use read_url when the user mentions a URL and wants context from it
- Do not claim to use files, shell commands, GitHub, email, notes, or private user data unless a dedicated robot tool is available';
BEGIN
  IF EXISTS (SELECT 1 FROM skills WHERE id = skill_id) THEN
    UPDATE skills SET
      display_name = 'Robot Assistant',
      description  = 'Physical robot assistant with a restricted, voice-friendly toolset.',
      content      = skill_content,
      category     = 'assistant',
      is_system    = true,
      updated_at   = NOW()
    WHERE id = skill_id;
  ELSE
    INSERT INTO skills (
      id, user_id, name, display_name, description, content,
      category, verified, shared, version, is_system
    ) VALUES (
      skill_id, NULL, 'robot-assistant', 'Robot Assistant',
      'Physical robot assistant with a restricted, voice-friendly toolset.',
      skill_content, 'assistant', true, false, '1.0.0', true
    );
  END IF;

  INSERT INTO skill_tools (skill_id, tool_name) VALUES
    (skill_id, 'get_today_info'),
    (skill_id, 'search_web'),
    (skill_id, 'read_url')
  ON CONFLICT DO NOTHING;
END $$;

INSERT INTO domain_skill_defaults (domain_slug, skill_id)
VALUES ('robot-assistant', 'e5f6a7b8-c9d0-1234-ef01-234567890005')
ON CONFLICT (domain_slug) DO UPDATE SET skill_id = EXCLUDED.skill_id;
