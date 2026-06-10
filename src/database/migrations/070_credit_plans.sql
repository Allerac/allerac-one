CREATE TABLE IF NOT EXISTS credit_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  monthly_credits INTEGER NOT NULL CHECK (monthly_credits >= 0),
  image_edits INTEGER NOT NULL CHECK (image_edits >= 0),
  monthly_price_cents INTEGER NOT NULL CHECK (monthly_price_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  price_includes_tax BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO credit_plans (
  slug, name, monthly_credits, image_edits, monthly_price_cents,
  currency, price_includes_tax, sort_order
) VALUES
  ('free', 'Free', 20, 2, 0, 'EUR', true, 10),
  ('starter', 'Starter', 500, 50, 999, 'EUR', true, 20),
  ('pro', 'Pro', 2000, 200, 3499, 'EUR', true, 30),
  ('business', 'Business', 10000, 1000, 14999, 'EUR', true, 40)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  monthly_credits = EXCLUDED.monthly_credits,
  image_edits = EXCLUDED.image_edits,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  currency = EXCLUDED.currency,
  price_includes_tax = EXCLUDED.price_includes_tax,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

ALTER TABLE credit_accounts
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES credit_plans(id),
  ADD COLUMN IF NOT EXISTS period_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS period_ends_at TIMESTAMPTZ;

UPDATE credit_accounts ca
SET plan_id = p.id,
    balance_microusd = GREATEST(
      ca.balance_microusd,
      ca.reserved_microusd,
      p.monthly_credits::BIGINT * 10000
    ),
    unlimited = false,
    period_started_at = COALESCE(ca.period_started_at, NOW()),
    period_ends_at = COALESCE(ca.period_ends_at, NOW() + INTERVAL '1 month'),
    updated_at = NOW()
FROM users u
JOIN credit_plans p ON p.slug = CASE WHEN u.is_admin THEN 'pro' ELSE 'free' END
WHERE ca.user_id = u.id
  AND ca.plan_id IS NULL;

INSERT INTO credit_accounts (
  user_id,
  balance_microusd,
  unlimited,
  plan_id,
  period_started_at,
  period_ends_at
)
SELECT
  u.id,
  p.monthly_credits::BIGINT * 10000,
  false,
  p.id,
  NOW(),
  NOW() + INTERVAL '1 month'
FROM users u
JOIN credit_plans p ON p.slug = CASE WHEN u.is_admin THEN 'pro' ELSE 'free' END
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE credit_ledger
  DROP CONSTRAINT IF EXISTS credit_ledger_entry_type_check;

ALTER TABLE credit_ledger
  ADD CONSTRAINT credit_ledger_entry_type_check
  CHECK (entry_type IN (
    'monthly_grant',
    'manual_grant',
    'manual_deduction',
    'purchase',
    'charge',
    'refund',
    'adjustment',
    'expiration'
  ));

ALTER TABLE credit_ledger
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES credit_plans(id);
