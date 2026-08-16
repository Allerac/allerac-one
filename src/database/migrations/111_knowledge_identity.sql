-- User-facing identity only: retain the stable `memory` slug, route, scopes, and APIs.
UPDATE domains
SET display_name = 'Knowledge'
WHERE slug = 'memory';

UPDATE skills
SET display_name = '🗂️ Knowledge',
    description = 'Explore and manage Allerac''s personal knowledge graph.',
    updated_at = NOW()
WHERE name = 'memory'
  AND user_id IS NULL;
