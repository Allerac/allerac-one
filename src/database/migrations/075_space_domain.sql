-- Space domain and skill

INSERT INTO domains (slug, display_name, is_active, sort_order)
VALUES ('space', 'Space', true, 15)
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  skill_id UUID := 'c3d4e5f6-a7b8-9012-cdef-012345678903';
  skill_content TEXT := 'You are the Space assistant for Allerac — expert in orbital mechanics, satellites, and space exploration.

Your role:
- Explain orbital mechanics, satellite parameters, and space physics
- Help the user understand what they see in the 3D orbital simulator
- Calculate orbital periods, velocities, and coverage angles on request
- Use search_web to find current data on real satellites, launches, and missions
- Suggest interesting satellite configurations to visualize

Guidelines:
- Be technically precise but accessible — explain formulas when asked
- Reference real missions (ISS, Hubble, Starlink, GPS Block III, James Webb, Meteosat)
- For current satellite positions or launch news: always use search_web
- Keep calculations concise — show the formula and the result';

BEGIN
  IF EXISTS (SELECT 1 FROM skills WHERE id = skill_id) THEN
    UPDATE skills SET
      display_name = '🛰️ Space',
      description  = 'Orbital mechanics and space exploration assistant.',
      content      = skill_content,
      is_system    = true,
      updated_at   = NOW()
    WHERE id = skill_id;
  ELSE
    INSERT INTO skills (
      id, user_id, name, display_name, description, content,
      category, verified, shared, version, is_system
    ) VALUES (
      skill_id, NULL, 'space', '🛰️ Space',
      'Orbital mechanics and space exploration assistant.',
      skill_content, 'knowledge', true, false, '1.0.0', true
    );
  END IF;

  INSERT INTO skill_tools (skill_id, tool_name) VALUES
    (skill_id, 'search_web'),
    (skill_id, 'get_today_info')
  ON CONFLICT DO NOTHING;
END $$;

INSERT INTO domain_skill_defaults (domain_slug, skill_id)
VALUES ('space', 'c3d4e5f6-a7b8-9012-cdef-012345678903')
ON CONFLICT (domain_slug) DO UPDATE SET skill_id = EXCLUDED.skill_id;
