-- Explicit recurrence declaration per invoice, so the Expenses > Calendar tab
-- can predict the next expected invoice using the real billing cadence instead
-- of assuming every provider bills monthly.

ALTER TABLE expense_invoices ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE expense_invoices ADD COLUMN IF NOT EXISTS recurrence_interval TEXT
  CHECK (recurrence_interval IN ('weekly', 'monthly', 'quarterly', 'yearly'));
