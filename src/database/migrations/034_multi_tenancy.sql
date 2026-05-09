-- Multi-tenancy: admin flag, domains table, user-domain access control

-- 1. Admin flag on users (all existing users become admin)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
UPDATE users SET is_admin = true;

-- 2. Domains registry (single source of truth)
CREATE TABLE IF NOT EXISTS domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO domains (slug, display_name, is_active) VALUES
  ('chat',    'Chat',    true),
  ('code',    'Code',    true),
  ('social',  'Social',  true),
  ('health',  'Health',  true),
  ('recipes', 'Recipes', false),
  ('finance', 'Finance', false),
  ('write',   'Write',   false)
ON CONFLICT (slug) DO NOTHING;

-- 3. User ↔ domain access (N:M, non-admin users only)
CREATE TABLE IF NOT EXISTS user_domain_access (
  user_id   UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, domain_id)
);
