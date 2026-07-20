-- Benchmark starts as an admin-only domain. It can evolve into Quality Evaluator.

INSERT INTO domains (slug, display_name, is_active, sort_order)
VALUES ('benchmark', 'Benchmark', true, 18)
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;
