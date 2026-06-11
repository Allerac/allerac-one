-- Migration 074: Rename the Instagram-only form tool for Social Studio.
INSERT INTO skill_tools (skill_id, tool_name)
SELECT skill_id, 'update_social_form'
FROM skill_tools
WHERE tool_name = 'update_instagram_form'
ON CONFLICT DO NOTHING;

DELETE FROM skill_tools
WHERE tool_name = 'update_instagram_form';

UPDATE skills
SET force_tool = 'update_social_form'
WHERE force_tool = 'update_instagram_form';
