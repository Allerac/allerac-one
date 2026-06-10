CREATE TABLE IF NOT EXISTS usage_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  unit TEXT NOT NULL,
  customer_price_microusd BIGINT NOT NULL CHECK (customer_price_microusd >= 0),
  provider_cost_microusd BIGINT CHECK (provider_cost_microusd IS NULL OR provider_cost_microusd >= 0),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_pricing_active
  ON usage_pricing(operation_type, provider, model, unit)
  WHERE effective_until IS NULL;

INSERT INTO usage_pricing (
  operation_type,
  provider,
  model,
  unit,
  customer_price_microusd,
  provider_cost_microusd,
  metadata
) VALUES (
  'image_edit',
  'gemini',
  'gemini-3.1-flash-image',
  'image_1k',
  100000,
  67000,
  '{"credits": 10, "pricing_checked_at": "2026-06-10"}'::jsonb
)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS credit_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_microusd BIGINT NOT NULL DEFAULT 0 CHECK (balance_microusd >= 0),
  reserved_microusd BIGINT NOT NULL DEFAULT 0 CHECK (reserved_microusd >= 0),
  unlimited BOOLEAN NOT NULL DEFAULT false,
  blocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (unlimited OR reserved_microusd <= balance_microusd)
);

INSERT INTO credit_accounts (user_id, unlimited)
SELECT id, is_admin
FROM users
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS usage_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pricing_id UUID NOT NULL REFERENCES usage_pricing(id),
  operation_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  reserved_microusd BIGINT NOT NULL CHECK (reserved_microusd >= 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'settled', 'released', 'expired')),
  idempotency_key TEXT NOT NULL UNIQUE,
  reference_type TEXT,
  reference_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_usage_reservations_user_status
  ON usage_reservations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_usage_reservations_expiry
  ON usage_reservations(expires_at)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL
    CHECK (entry_type IN (
      'manual_grant',
      'manual_deduction',
      'charge',
      'refund',
      'adjustment'
    )),
  amount_microusd BIGINT NOT NULL,
  balance_after_microusd BIGINT NOT NULL CHECK (balance_after_microusd >= 0),
  operation_type TEXT,
  provider TEXT,
  model TEXT,
  credential_source TEXT CHECK (credential_source IN ('system', 'user', 'local')),
  provider_cost_microusd BIGINT,
  pricing_id UUID REFERENCES usage_pricing(id),
  reservation_id UUID REFERENCES usage_reservations(id),
  reference_type TEXT,
  reference_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created
  ON credit_ledger(user_id, created_at DESC);

