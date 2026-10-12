-- Public OpenWorld domain: powers the FAQ chat widget on
-- www.openworld.com.br (OpenWorld's institutional site, a separate
-- allerac.ai client, not Allerac itself).
--
-- Same isolation pattern as the sales domain (see
-- docs/domains/expose-agent-to-website.md): reached only by a dedicated,
-- non-admin service account with NO other domain access. Unlike sales, this
-- bot has zero tools (FAQ-answering only, no create_ticket / lead capture)
-- — see the NO_TOOL_DOMAINS guard in chat-tool-registry.ts, not the usual
-- skill_tools mechanism (an empty skill_tools list means "unrestricted",
-- not "no tools" — see that file's comment for why this domain is handled
-- differently).
--
-- The skill itself lives in skills/openworld.md (domain: openworld in its
-- frontmatter) and is synced/bound automatically by SystemSkillsLoader on
-- app startup — see docs/domains/add-domain.md. Nothing else needed here.

INSERT INTO domains (slug, display_name, is_active, sort_order)
VALUES ('openworld', 'OpenWorld', true, 21)
ON CONFLICT (slug) DO NOTHING;
