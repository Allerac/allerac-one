-- Quarterly compliance tracking: separate from expense_invoices because a tax
-- filing isn't a payment (no required currency/amount) — it's proof that a
-- declaration was submitted to the tax authority for a given quarter.

CREATE TABLE IF NOT EXISTS tax_filings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year       INTEGER NOT NULL,
  period_quarter    INTEGER NOT NULL CHECK (period_quarter BETWEEN 1 AND 4),
  filing_type       TEXT NOT NULL,
  due_date          DATE NOT NULL,
  submitted_date    DATE,
  file_name         TEXT,
  file_type         TEXT,
  file_data         BYTEA,
  notes             TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (period_year, period_quarter, filing_type)
);

CREATE INDEX IF NOT EXISTS idx_tax_filings_due_date ON tax_filings(due_date DESC);
