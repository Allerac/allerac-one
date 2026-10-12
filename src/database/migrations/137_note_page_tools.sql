-- Grant the new read-only page tools (get_note, list_children) to every skill
-- that already has the notes vault (save_note). Skills with an explicit
-- skill_tools list would otherwise never see them.

INSERT INTO skill_tools (skill_id, tool_name)
SELECT st.skill_id, t.tool_name
FROM skill_tools st
CROSS JOIN (VALUES ('get_note'), ('list_children')) AS t(tool_name)
WHERE st.tool_name = 'save_note'
ON CONFLICT DO NOTHING;
