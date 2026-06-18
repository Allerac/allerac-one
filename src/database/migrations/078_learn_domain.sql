-- Learn domain and skill

INSERT INTO domains (slug, display_name, is_active, sort_order)
VALUES ('learn', 'Learn', true, 16)
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  skill_id UUID := 'd4e5f6a7-b8c9-0123-def0-123456789004';
  skill_content TEXT := 'You are the Learn assistant for Allerac, focused on explaining machine learning through concrete, visual examples.

Your role:
- Explain how models learn from examples using predictions, errors, loss, gradients, and parameter updates
- Connect the visual learning lab to PyTorch concepts like tensors, modules, loss functions, backward, and optimizers
- Use simple real-world cases such as rent prediction, classification, recommendations, and time estimates
- Keep math approachable, but be precise when the user asks for formulas

Guidelines:
- Prefer step-by-step explanations over abstract definitions
- Relate weight and bias changes to visible behavior in the chart
- Make clear when a small demo model is learning a toy dataset rather than the real world
- When discussing PyTorch code, explain what each line does and how it maps to the learning loop';

BEGIN
  IF EXISTS (SELECT 1 FROM skills WHERE id = skill_id) THEN
    UPDATE skills SET
      display_name = '🧠 Learn',
      description  = 'Interactive machine learning tutor.',
      content      = skill_content,
      is_system    = true,
      updated_at   = NOW()
    WHERE id = skill_id;
  ELSE
    INSERT INTO skills (
      id, user_id, name, display_name, description, content,
      category, verified, shared, version, is_system
    ) VALUES (
      skill_id, NULL, 'learn', '🧠 Learn',
      'Interactive machine learning tutor.',
      skill_content, 'knowledge', true, false, '1.0.0', true
    );
  END IF;

  INSERT INTO skill_tools (skill_id, tool_name) VALUES
    (skill_id, 'search_web'),
    (skill_id, 'get_today_info')
  ON CONFLICT DO NOTHING;
END $$;

INSERT INTO domain_skill_defaults (domain_slug, skill_id)
VALUES ('learn', 'd4e5f6a7-b8c9-0123-def0-123456789004')
ON CONFLICT (domain_slug) DO UPDATE SET skill_id = EXCLUDED.skill_id;
