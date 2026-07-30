'use server';

import pool from '@/app/clients/db';
import { requireCurrentAdmin } from '@/app/lib/auth-session';

async function assertAdmin() {
  return requireCurrentAdmin();
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export interface TaxFiling {
  id: string;
  period_year: number;
  period_quarter: number;
  filing_type: string;
  due_date: string;
  submitted_date: string | null;
  notes: string | null;
  file_name: string | null;
  has_file: boolean;
}

function isUuid(value: string): boolean {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

interface ParsedFields {
  period_year: number;
  period_quarter: number;
  filing_type: string;
  due_date: string;
  submitted_date: string | null;
  notes: string | null;
}

function parseDate(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null;
}

function parseFields(formData: FormData): { ok: true; fields: ParsedFields } | { ok: false; error: string } {
  const year = Number(String(formData.get('period_year') ?? '').trim());
  const quarter = Number(String(formData.get('period_quarter') ?? '').trim());
  const filingType = String(formData.get('filing_type') ?? '').trim();
  const dueDate = parseDate(formData.get('due_date'));
  const submittedDate = parseDate(formData.get('submitted_date'));
  const notesRaw = String(formData.get('notes') ?? '').trim();

  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { ok: false, error: 'Invalid year' };
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) return { ok: false, error: 'Invalid quarter' };
  if (!filingType || filingType.length > 100) return { ok: false, error: 'Invalid filing type' };
  if (!dueDate) return { ok: false, error: 'Invalid due date' };
  if (notesRaw.length > 1000) return { ok: false, error: 'Notes are too long (max 1000 characters)' };

  return {
    ok: true,
    fields: {
      period_year: year,
      period_quarter: quarter,
      filing_type: filingType,
      due_date: dueDate,
      submitted_date: submittedDate,
      notes: notesRaw || null,
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

export async function listTaxFilings(): Promise<TaxFiling[]> {
  await assertAdmin();
  const result = await pool.query(`
    SELECT id, period_year, period_quarter, filing_type,
           TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date,
           TO_CHAR(submitted_date, 'YYYY-MM-DD') AS submitted_date,
           notes, file_name, (file_data IS NOT NULL) AS has_file
    FROM tax_filings
    ORDER BY due_date DESC, created_at DESC
  `);
  return result.rows;
}

export async function createTaxFiling(
  formData: FormData
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const admin = await assertAdmin();

  const parsed = parseFields(formData);
  if (!parsed.ok) return { success: false, error: parsed.error };
  const fileResult = await parseFile(formData);
  if (!fileResult.ok) return { success: false, error: fileResult.error };

  const f = parsed.fields;
  const file = fileResult.file;
  try {
    const result = await pool.query(
      `INSERT INTO tax_filings (
         period_year, period_quarter, filing_type, due_date, submitted_date,
         notes, file_name, file_type, file_data, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        f.period_year, f.period_quarter, f.filing_type, f.due_date, f.submitted_date,
        f.notes, file?.name ?? null, file?.type ?? null, file?.buffer ?? null,
        admin.id,
      ]
    );
    return { success: true, id: result.rows[0].id };
  } catch (error) {
    if (error instanceof Error && error.message.includes('tax_filings_period_year_period_quarter_filing_type_key')) {
      return { success: false, error: 'A filing of this type already exists for this quarter' };
    }
    throw error;
  }
}

export async function updateTaxFiling(
  id: string,
  formData: FormData
): Promise<{ success: true } | { success: false; error: string }> {
  await assertAdmin();
  if (!isUuid(id)) return { success: false, error: 'Invalid filing ID' };

  const parsed = parseFields(formData);
  if (!parsed.ok) return { success: false, error: parsed.error };
  const fileResult = await parseFile(formData);
  if (!fileResult.ok) return { success: false, error: fileResult.error };

  const f = parsed.fields;
  const file = fileResult.file;

  try {
    if (file) {
      await pool.query(
        `UPDATE tax_filings SET
           period_year = $1, period_quarter = $2, filing_type = $3, due_date = $4, submitted_date = $5,
           notes = $6, file_name = $7, file_type = $8, file_data = $9, updated_at = NOW()
         WHERE id = $10`,
        [f.period_year, f.period_quarter, f.filing_type, f.due_date, f.submitted_date, f.notes, file.name, file.type, file.buffer, id]
      );
    } else {
      await pool.query(
        `UPDATE tax_filings SET
           period_year = $1, period_quarter = $2, filing_type = $3, due_date = $4, submitted_date = $5,
           notes = $6, updated_at = NOW()
         WHERE id = $7`,
        [f.period_year, f.period_quarter, f.filing_type, f.due_date, f.submitted_date, f.notes, id]
      );
    }
    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes('tax_filings_period_year_period_quarter_filing_type_key')) {
      return { success: false, error: 'A filing of this type already exists for this quarter' };
    }
    throw error;
  }
}

export async function deleteTaxFiling(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  await assertAdmin();
  if (!isUuid(id)) return { success: false, error: 'Invalid filing ID' };
  await pool.query('DELETE FROM tax_filings WHERE id = $1', [id]);
  return { success: true };
}
