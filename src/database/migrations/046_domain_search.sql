INSERT INTO domains (slug, display_name, is_active)
VALUES ('search', 'Search', true)
ON CONFLICT (slug) DO NOTHING;
