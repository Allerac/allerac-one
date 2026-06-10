ALTER TABLE usage_pricing
  ADD COLUMN IF NOT EXISTS provider_cost_currency CHAR(3) NOT NULL DEFAULT 'EUR';

CREATE TABLE IF NOT EXISTS operation_routes (
  operation_type TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  unit TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO operation_routes (
  operation_type, provider, model, unit, display_name, metadata
) VALUES (
  'image_edit',
  'gemini',
  'gemini-3.1-flash-image',
  'image_1k',
  'AI image editing',
  '{"domain": "social"}'::jsonb
)
ON CONFLICT (operation_type) DO NOTHING;

UPDATE usage_pricing
SET provider_cost_microusd = 70000,
    provider_cost_currency = 'EUR',
    metadata = metadata || '{"provider_cost_source": "estimated_google_invoice_eur"}'::jsonb
WHERE operation_type = 'image_edit'
  AND provider = 'gemini'
  AND model = 'gemini-3.1-flash-image'
  AND unit = 'image_1k'
  AND effective_until IS NULL;
