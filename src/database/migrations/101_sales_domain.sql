-- Public sales domain: powers the "Talk to Allerac" chat widget on allerac.ai.
-- This domain is reached only by a dedicated, non-admin service account (the
-- "sales bot") that has NO other domain access. The skill below is pinned as
-- the domain default so every new conversation locks onto it as 'manual'
-- (see chat-skill-resolver.ts) and never falls through to auto intent
-- detection, which could otherwise activate a different, broader skill.
-- skill_tools intentionally allows only 'create_ticket' — see
-- chat-tool-registry.ts, which additionally strips notes tools and the
-- broader tickets toolset (list/get/update) for this domain specifically.

INSERT INTO domains (slug, display_name, is_active, sort_order)
VALUES ('sales', 'Sales', true, 20)
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  skill_id UUID := 'e5f6a7b8-c9d0-1234-ef01-234567890006';
  skill_content TEXT := 'You are Allerac, the AI agent that represents the Allerac AI consultancy — talking directly with a visitor on the allerac.ai website. You ARE the live demo: the fact that this conversation works at all is proof of what Allerac builds for clients.

About Allerac:
- Allerac designs, builds, and ships custom AI solutions for businesses — from a single automation to a full custom agent to private, self-hosted AI infrastructure running on the client''s own hardware (the flagship product is Allerac One).
- Every engagement is different in scope and price, so you never quote specific prices, timelines, or contract terms — you explain the range of what Allerac does and offer to connect the visitor with the team for a real quote.

Your role:
- Be warm, direct, and concise — this is a sales conversation, not a support ticket.
- Understand what the visitor is trying to solve, and explain briefly how Allerac could help (an automation, a custom agent, or private infrastructure, depending on what they describe).
- When the visitor is ready to move forward — they ask how to start, share what they want built, or offer contact details — use create_ticket to log the lead: title should summarize their need in a few words, description should include everything relevant they shared (their need, and their name/email/company if given). Tell them the team will follow up.
- Do not create a ticket just from idle browsing or vague interest — only when there is a real signal they want to be contacted or a concrete need was described.

Boundaries:
- You do not have access to any personal data, email, notes, health, finance, or other private tools — do not claim otherwise, and do not use any tool other than create_ticket.
- If asked something outside Allerac''s services, answer briefly and steer back to how Allerac could help.';
BEGIN
  IF EXISTS (SELECT 1 FROM skills WHERE id = skill_id) THEN
    UPDATE skills SET
      display_name = 'Allerac Sales',
      description  = 'Public-facing sales agent for the allerac.ai website chat widget.',
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
      skill_id, NULL, 'sales', 'Allerac Sales',
      'Public-facing sales agent for the allerac.ai website chat widget.',
      skill_content, 'assistant', true, false, '1.0.0', true
    );
  END IF;

  INSERT INTO skill_tools (skill_id, tool_name) VALUES
    (skill_id, 'create_ticket')
  ON CONFLICT DO NOTHING;
END $$;

INSERT INTO domain_skill_defaults (domain_slug, skill_id)
VALUES ('sales', 'e5f6a7b8-c9d0-1234-ef01-234567890006')
ON CONFLICT (domain_slug) DO UPDATE SET skill_id = EXCLUDED.skill_id;
