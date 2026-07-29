-- Allerac's own operating expenses: invoices from providers (Anthropic, OpenAI,
-- Azure, hosting, domains, etc.), tracked by admins. Not a user-facing AI domain.

CREATE TABLE IF NOT EXISTS expense_invoices (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider               TEXT NOT NULL,
  invoice_number         TEXT NOT NULL,
  billing_period_start   DATE,
  billing_period_end     DATE,
  invoice_date           DATE NOT NULL,
  currency               TEXT NOT NULL DEFAULT 'USD',
  amount                 NUMERIC(12,2) NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  file_name              TEXT,
  file_type              TEXT,
  file_data              BYTEA,
  created_by             UUID REFERENCES users(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_invoices_invoice_date ON expense_invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_expense_invoices_provider ON expense_invoices(provider);
