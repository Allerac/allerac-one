-- Music domain: Spotify-based listening history and recommendations.

INSERT INTO domains (slug, display_name, is_active, sort_order)
VALUES ('music', 'Music', true, 20)
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;
