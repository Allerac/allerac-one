'use server';

import pool from '@/app/clients/db';
import { requireCurrentAdmin } from '@/app/lib/auth-session';

async function assertAdmin() {
  return requireCurrentAdmin();
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = ['pending', 'paid', 'overdue', 'cancelled'] as const;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export type ExpenseStatus = typeof STATUSES[number];

export interface ExpenseInvoice {
  id: string;
  provider: string;
  invoice_number: string;
  billing_period_start: string | null;
  billing_period_end: string | null;
  invoice_date: string;
  currency: string;
  amount: number;
  status: ExpenseStatus;
  tag: string | null;
  file_name: string | null;
  has_file: boolean;
}

function isUuid(value: string): boolean {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

interface ParsedFields {
  provider: string;
  invoice_number: string;
  billing_period_start: string | null;
  billing_period_end: string | null;
  invoice_date: string;
  currency: string;
  amount: number;
  status: ExpenseStatus;
  tag: string | null;
}

function parseDate(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null;
}

function parseFields(formData: FormData): { ok: true; fields: ParsedFields } | { ok: false; error: string } {
  const provider = String(formData.get('provider') ?? '').trim();
  const invoiceNumber = String(formData.get('invoice_number') ?? '').trim();
  const currency = String(formData.get('currency') ?? '').trim().toUpperCase();
  const status = String(formData.get('status') ?? '').trim() as ExpenseStatus;
  const amountRaw = String(formData.get('amount') ?? '').trim();
  const invoiceDate = parseDate(formData.get('invoice_date'));
  const billingStart = parseDate(formData.get('billing_period_start'));
  const billingEnd = parseDate(formData.get('billing_period_end'));
  const tagRaw = String(formData.get('tag') ?? '').trim();

  if (!provider || provider.length > 200) return { ok: false, error: 'Invalid provider' };
  if (!invoiceNumber || invoiceNumber.length > 100) return { ok: false, error: 'Invalid invoice number' };
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: 'Currency must be a 3-letter code' };
  if (!STATUSES.includes(status)) return { ok: false, error: 'Invalid status' };
  if (!invoiceDate) return { ok: false, error: 'Invalid invoice date' };
  if (tagRaw.length > 50) return { ok: false, error: 'Tag is too long (max 50 characters)' };
  if ((formData.get('billing_period_start') || formData.get('billing_period_end')) && (!billingStart || !billingEnd)) {
    return { ok: false, error: 'Billing period needs both a start and end date' };
  }
  if (billingStart && billingEnd && billingStart > billingEnd) {
    return { ok: false, error: 'Billing period start must be before the end' };
  }

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Amount must be a positive number' };

  return {
    ok: true,
    fields: {
      provider,
      invoice_number: invoiceNumber,
      billing_period_start: billingStart,
      billing_period_end: billingEnd,
      invoice_date: invoiceDate,
      currency,
      amount,
      status,
      tag: tagRaw || null,
    },
  };
}

async function parseFile(formData: FormData): Promise<
  { ok: true; file: { name: string; type: string; buffer: Buffer } | null } | { ok: false; error: string }
> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: true, file: null };
  if (file.size > MAX_FILE_SIZE_BYTES) return { ok: false, error: 'File is too large. Maximum size is 10 MB.' };
  if (!ALLOWED_FILE_TYPES.has(file.type)) return { ok: false, error: 'File must be a PDF, JPEG, or PNG' };
  const buffer = Buffer.from(await file.arrayBuffer());
  return { ok: true, file: { name: file.name, type: file.type, buffer } };
}

export async function listExpenses(): Promise<ExpenseInvoice[]> {
  await assertAdmin();
  const result = await pool.query(`
    SELECT id, provider, invoice_number,
           TO_CHAR(billing_period_start, 'YYYY-MM-DD') AS billing_period_start,
           TO_CHAR(billing_period_end, 'YYYY-MM-DD') AS billing_period_end,
           TO_CHAR(invoice_date, 'YYYY-MM-DD') AS invoice_date,
           currency, amount::float8 AS amount, status, tag, file_name,
           (file_data IS NOT NULL) AS has_file
    FROM expense_invoices
    ORDER BY invoice_date DESC, created_at DESC
  `);
  return result.rows;
}

export async function createExpense(
  formData: FormData
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const admin = await assertAdmin();

  const parsed = parseFields(formData);
  if (!parsed.ok) return { success: false, error: parsed.error };
  const fileResult = await parseFile(formData);
  if (!fileResult.ok) return { success: false, error: fileResult.error };

  const f = parsed.fields;
  const file = fileResult.file;
  const result = await pool.query(
    `INSERT INTO expense_invoices (
       provider, invoice_number, billing_period_start, billing_period_end,
       invoice_date, currency, amount, status, tag, file_name, file_type, file_data, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id`,
    [
      f.provider, f.invoice_number, f.billing_period_start, f.billing_period_end,
      f.invoice_date, f.currency, f.amount, f.status, f.tag,
      file?.name ?? null, file?.type ?? null, file?.buffer ?? null,
      admin.id,
    ]
  );
  return { success: true, id: result.rows[0].id };
}

export async function updateExpense(
  id: string,
  formData: FormData
): Promise<{ success: true } | { success: false; error: string }> {
  await assertAdmin();
  if (!isUuid(id)) return { success: false, error: 'Invalid invoice ID' };

  const parsed = parseFields(formData);
  if (!parsed.ok) return { success: false, error: parsed.error };
  const fileResult = await parseFile(formData);
  if (!fileResult.ok) return { success: false, error: fileResult.error };

  const f = parsed.fields;
  const file = fileResult.file;

  if (file) {
    await pool.query(
      `UPDATE expense_invoices SET
         provider = $1, invoice_number = $2, billing_period_start = $3, billing_period_end = $4,
         invoice_date = $5, currency = $6, amount = $7, status = $8, tag = $9,
         file_name = $10, file_type = $11, file_data = $12, updated_at = NOW()
       WHERE id = $13`,
      [
        f.provider, f.invoice_number, f.billing_period_start, f.billing_period_end,
        f.invoice_date, f.currency, f.amount, f.status, f.tag,
        file.name, file.type, file.buffer, id,
      ]
    );
  } else {
    await pool.query(
      `UPDATE expense_invoices SET
         provider = $1, invoice_number = $2, billing_period_start = $3, billing_period_end = $4,
         invoice_date = $5, currency = $6, amount = $7, status = $8, tag = $9, updated_at = NOW()
       WHERE id = $10`,
      [
        f.provider, f.invoice_number, f.billing_period_start, f.billing_period_end,
        f.invoice_date, f.currency, f.amount, f.status, f.tag, id,
      ]
    );
  }
  return { success: true };
}

export async function deleteExpense(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  await assertAdmin();
  if (!isUuid(id)) return { success: false, error: 'Invalid invoice ID' };
  await pool.query('DELETE FROM expense_invoices WHERE id = $1', [id]);
  return { success: true };
}
