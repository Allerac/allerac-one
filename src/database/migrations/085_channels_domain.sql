-- Messaging integrations start with Telegram and can expand to other channels.

INSERT INTO domains (slug, display_name, is_active, sort_order)
VALUES ('channels', 'Channels', true, 19)
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;
