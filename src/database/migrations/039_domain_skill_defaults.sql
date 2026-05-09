-- Migration 039: Domain → Skill default binding table
CREATE TABLE IF NOT EXISTS domain_skill_defaults (
  domain_slug TEXT PRIMARY KEY,
  skill_id    UUID REFERENCES skills(id) ON DELETE SET NULL,
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed from current hardcoded mappings
INSERT INTO domain_skill_defaults (domain_slug, skill_id)
SELECT 'code', id FROM skills WHERE name = 'programmer' LIMIT 1
ON CONFLICT (domain_slug) DO NOTHING;

INSERT INTO domain_skill_defaults (domain_slug, skill_id)
SELECT 'health', id FROM skills WHERE name = 'health' LIMIT 1
ON CONFLICT (domain_slug) DO NOTHING;

INSERT INTO domain_skill_defaults (domain_slug, skill_id)
SELECT 'social', id FROM skills WHERE name = 'social' LIMIT 1
ON CONFLICT (domain_slug) DO NOTHING;

INSERT INTO domain_skill_defaults (domain_slug, skill_id)
SELECT 'finance', id FROM skills WHERE name = 'finance' LIMIT 1
ON CONFLICT (domain_slug) DO NOTHING;

INSERT INTO domain_skill_defaults (domain_slug, skill_id)
SELECT 'recipes', id FROM skills WHERE name = 'chef' LIMIT 1
ON CONFLICT (domain_slug) DO NOTHING;

INSERT INTO domain_skill_defaults (domain_slug, skill_id)
SELECT 'write', id FROM skills WHERE name = 'writer' LIMIT 1
ON CONFLICT (domain_slug) DO NOTHING;
