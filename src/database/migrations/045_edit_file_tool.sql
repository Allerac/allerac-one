-- Migration 045: register edit_file tool for programmer skill
INSERT INTO skill_tools (skill_id, tool_name)
SELECT id, 'edit_file' FROM skills WHERE name = 'programmer'
ON CONFLICT DO NOTHING;
