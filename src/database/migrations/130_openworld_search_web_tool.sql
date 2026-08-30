-- Grants the openworld skill access to search_web, now that 'openworld' has been
-- removed from NO_TOOL_DOMAINS (chat-tool-registry.ts) — see migration
-- 128_openworld_domain.sql, which originally documented this domain as zero-tools.
--
-- The visitor asked for current foreign-trade news, which the FAQ knowledge base
-- (a static skills/openworld.md) can't answer — search_web lets the assistant look
-- it up instead of guessing or claiming it has no web access at all.
--
-- Only this one tool: openworld still gets none of the domain/personal tools
-- (notes, memory, tickets, jobs, etc.) — those are withheld from every
-- PUBLIC_DOMAINS entry unconditionally in chat-tool-registry.ts regardless of
-- skill_tools. An empty skill_tools list means "unrestricted" (see that file's
-- comment), so this must be a real, non-empty, explicit list.

INSERT INTO skill_tools (skill_id, tool_name)
SELECT id, 'search_web'
FROM skills
WHERE source_file = 'openworld.md' AND is_system = true
ON CONFLICT DO NOTHING;
