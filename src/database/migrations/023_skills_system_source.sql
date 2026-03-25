-- Add is_system and source_file to skills table
-- System skills are loaded from /skills/*.md files in the repo

ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_file VARCHAR(200);

-- Mark existing programmer skill as system skill
UPDATE skills SET is_system = true, source_file = 'programmer.md'
WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

CREATE INDEX IF NOT EXISTS idx_skills_system ON skills(is_system) WHERE is_system = true;

-- Unique constraint so ON CONFLICT (source_file) works in the loader
CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_source_file ON skills(source_file) WHERE is_system = true;
