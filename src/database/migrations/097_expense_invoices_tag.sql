-- Single freeform category per invoice (e.g. "AI API", "Hosting", "Domains"),
-- used to break down spend in the Expenses > Analytics tab.

ALTER TABLE expense_invoices ADD COLUMN IF NOT EXISTS tag TEXT;

CREATE INDEX IF NOT EXISTS idx_expense_invoices_tag ON expense_invoices(tag);
