-- Migration 044: Design domain
-- The design skill content is loaded from skills/design.md by SystemSkillsLoader on app startup.
-- We only create the domain here; the skill binding is applied after startup via a deferred upsert.

INSERT INTO domains (slug, display_name, is_active)
VALUES ('design', 'Design', true)
ON CONFLICT (slug) DO NOTHING;
