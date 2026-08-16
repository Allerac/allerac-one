-- Public sales domain: powers the "Talk to Allerac" chat widget on allerac.ai.
-- This domain is reached only by a dedicated, non-admin service account (the
-- "sales bot") that has NO other domain access.
--
-- The skill itself lives in skills/sales.md (domain: sales in its frontmatter)
-- and is synced/bound automatically by SystemSkillsLoader on app startup — see
-- docs/domains/add-domain.md. Nothing else needed here.
--
-- (This migration originally seeded the skill inline via raw SQL, matching the
-- older 082_robot_assistant_domain.sql pattern. On the environment this first
-- shipped to, that left an orphaned skill row once skills/sales.md was added —
-- see docs/domains/expose-agent-to-website.md for the one-time manual cleanup
-- query. Fresh installs running this migration for the first time won't hit
-- that, since skills/sales.md already exists by the time they apply it.)

INSERT INTO domains (slug, display_name, is_active, sort_order)
VALUES ('sales', 'Sales', true, 20)
ON CONFLICT (slug) DO NOTHING;
