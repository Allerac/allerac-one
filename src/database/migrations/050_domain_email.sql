INSERT INTO domains (slug, display_name, is_active)
VALUES ('email', 'Email', true)
ON CONFLICT (slug) DO NOTHING;
