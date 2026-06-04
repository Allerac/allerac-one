DO $$
DECLARE
  skill_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567891';
  skill_content TEXT := 'You are a personal assistant. You help the user with anything they need — notes, information, health data, email, tasks, research, or just a conversation.

Behavior:
- Use tools when they are the right answer — don''t explain how to do something when you can just do it
- Keep responses concise and direct, especially on Telegram
- Always reply in the user''s configured language (see Context section)
- Never force a search for greetings, casual messages, or things you already know
- When saving notes, confirm with a brief "saved ✓"
- When searching, synthesize results — don''t dump raw links

Tool guidance:
- `get_today_info`: call once per conversation when time matters
- `search_web`: only for current/real-time info (news, weather, prices, recent events)
- `read_url`: when the user shares a link and wants to know about it
- `save_note` / `list_notes` / `query_vault`: for the user''s personal knowledge base
- `get_health_summary` / `get_daily_snapshot`: for health and fitness questions
- `list_emails` / `read_email` / `send_email`: for email tasks';
BEGIN
  IF EXISTS (SELECT 1 FROM skills WHERE id = skill_id) THEN
    UPDATE skills SET
      display_name  = '🤖 Assistant',
      description   = 'Personal assistant — notes, search, health, email and more. Default skill for the universal Telegram bot.',
      content       = skill_content,
      is_system     = true,
      updated_at    = NOW()
    WHERE id = skill_id;
  ELSE
    INSERT INTO skills (
      id, user_id, name, display_name, description, content,
      category, verified, shared, version, is_system
    ) VALUES (
      skill_id,
      NULL,
      'assistant',
      '🤖 Assistant',
      'Personal assistant — notes, search, health, email and more. Default skill for the universal Telegram bot.',
      skill_content,
      'workflow',
      true,
      false,
      '1.0.0',
      true
    );
  END IF;

  -- Assign tools
  INSERT INTO skill_tools (skill_id, tool_name)
  VALUES
    (skill_id, 'get_today_info'),
    (skill_id, 'search_web'),
    (skill_id, 'read_url'),
    (skill_id, 'save_note'),
    (skill_id, 'query_vault'),
    (skill_id, 'list_notes'),
    (skill_id, 'update_note'),
    (skill_id, 'delete_note'),
    (skill_id, 'get_health_summary'),
    (skill_id, 'get_daily_snapshot'),
    (skill_id, 'get_recent_activities'),
    (skill_id, 'list_emails'),
    (skill_id, 'read_email'),
    (skill_id, 'send_email')
  ON CONFLICT DO NOTHING;
END $$;

-- Set as default skill for chat domain
INSERT INTO domain_skill_defaults (domain_slug, skill_id)
VALUES ('chat', 'a1b2c3d4-e5f6-7890-abcd-ef1234567891')
ON CONFLICT (domain_slug) DO UPDATE SET skill_id = EXCLUDED.skill_id;
