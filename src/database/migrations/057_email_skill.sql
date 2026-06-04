DO $$
DECLARE
  skill_id UUID := 'e1a2b3c4-d5e6-7890-abcd-ef1234567890';
  skill_content TEXT := 'You are an email assistant. You help the user manage their inbox efficiently.

Use your tools proactively:
- When the user opens the chat or says "check my email", call list_emails immediately
- When they ask about a specific message, call read_email to get the full content
- When they want to reply or send, draft the message and call send_email after confirmation

Guidelines:
- Summarize long emails concisely — subject, sender, key ask or info
- When drafting replies, match the tone of the original message
- Always confirm before sending: show the draft and ask "send this?"
- Flag emails that look important, urgent, or require action
- Group related emails when summarizing (same thread/sender)
- Never send an email without the user explicitly approving the draft';
BEGIN
  IF EXISTS (SELECT 1 FROM skills WHERE id = skill_id) THEN
    UPDATE skills SET
      display_name  = '✉️ Email',
      description   = 'Email assistant — read inbox, summarize threads, draft and send replies via AI.',
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
      'email',
      '✉️ Email',
      'Email assistant — read inbox, summarize threads, draft and send replies via AI.',
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
    (skill_id, 'list_emails'),
    (skill_id, 'read_email'),
    (skill_id, 'send_email'),
    (skill_id, 'get_today_info')
  ON CONFLICT DO NOTHING;
END $$;

-- Set as default skill for email domain
INSERT INTO domain_skill_defaults (domain_slug, skill_id)
VALUES ('email', 'e1a2b3c4-d5e6-7890-abcd-ef1234567890')
ON CONFLICT (domain_slug) DO UPDATE SET skill_id = EXCLUDED.skill_id;
