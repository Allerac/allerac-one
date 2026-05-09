-- Migration 040: Per-skill tool assignments
CREATE TABLE IF NOT EXISTS skill_tools (
  skill_id  UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  PRIMARY KEY (skill_id, tool_name)
);

-- Seed: programmer → shell + web + today
INSERT INTO skill_tools (skill_id, tool_name)
SELECT id, unnest(ARRAY['get_today_info','search_web','execute_shell'])
FROM skills WHERE name = 'programmer'
ON CONFLICT DO NOTHING;

-- Seed: health → health tools + web + today
INSERT INTO skill_tools (skill_id, tool_name)
SELECT id, unnest(ARRAY['get_today_info','search_web','get_health_summary','get_health_metrics','get_daily_snapshot','get_garmin_status','get_recent_activities'])
FROM skills WHERE name = 'health'
ON CONFLICT DO NOTHING;

-- Seed: social → instagram tools + web + today
INSERT INTO skill_tools (skill_id, tool_name)
SELECT id, unnest(ARRAY['get_today_info','search_web','update_instagram_form','instagram_publish_post','instagram_get_profile','instagram_get_recent_posts'])
FROM skills WHERE name = 'social'
ON CONFLICT DO NOTHING;

-- Seed: all other skills → web + today
INSERT INTO skill_tools (skill_id, tool_name)
SELECT id, unnest(ARRAY['get_today_info','search_web'])
FROM skills WHERE name IN ('chef','finance','writer','analyst','search','code-analyzer')
ON CONFLICT DO NOTHING;
