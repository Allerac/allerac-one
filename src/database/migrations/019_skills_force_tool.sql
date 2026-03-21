-- Add force_tool column to skills table
-- When set, the chat handler uses tool_choice: required for this specific tool
-- instead of tool_choice: auto, guaranteeing the LLM always calls it.
-- Example values: 'search_web', 'execute_shell'

ALTER TABLE skills ADD COLUMN IF NOT EXISTS force_tool VARCHAR(50) DEFAULT NULL;
