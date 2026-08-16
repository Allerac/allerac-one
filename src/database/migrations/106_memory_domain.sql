-- Memory meta-domain
INSERT INTO domains (slug, display_name, is_active, sort_order)
VALUES ('memory', 'Memory', true, 21)
ON CONFLICT (slug) DO NOTHING;
