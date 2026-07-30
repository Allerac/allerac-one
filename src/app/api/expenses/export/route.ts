/**
 * GET /api/expenses/export — bundles every invoice's metadata (as a plain-text
 * ASCII table) plus every attached invoice file into a single ZIP for download.
 *
 * A hand-drawn text table was chosen over CSV because CSV's column separator
 * is locale-dependent (Excel expects ';' in most European locales, not ','),
 * which made every row land in a single column when opened — a plain
 * monospace table has no delimiter to get wrong.
 *
 * Auth: admin session.
 */

import { NextRequest } from 'next/server';
import { ZipArchive } from 'archiver';
import pool from '@/app/clients/db';
import { authenticationErrorResponse, requireCurrentAdmin } from '@/app/lib/auth-session';

const UNTAGGED_FILTER = '__untagged__';
const STATUSES = new Set(['pending', 'paid', 'overdue', 'cancelled']);

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 150);
}

function extensionFor(fileType: string | null): string {
  if (fileType === 'application/pdf') return 'pdf';
  if (fileType === 'image/png') return 'png';
  return 'jpg';
}

/** Renders rows as a monospace box-drawn table, column widths sized to content. */
function buildAsciiTable(headers: string[], rows: string[][], rightAlign: Set<number>): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
  const separator = `+${widths.map(w => '-'.repeat(w + 2)).join('+')}+`;
  const renderRow = (cells: string[]) => `|${cells.map((cell, i) => {
    const padded = rightAlign.has(i) ? cell.padStart(widths[i]) : cell.padEnd(widths[i]);
    return ` ${padded} `;
  }).join('|')}|`;

  return [
    separator,
    renderRow(headers),
    separator,
    ...rows.map(renderRow),
    separator,
  ].join('\n');
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requireCurrentAdmin();
  } catch (error) {
    const authError = authenticationErrorResponse(error, { format: 'text' });
    if (authError) return authError;
    return new Response('Authentication failed', { status: 500 });
  }

  const params = request.nextUrl.searchParams;
  const provider = params.get('provider')?.trim() || null;
  const tag = params.get('tag')?.trim() || null;
  const month = params.get('month')?.trim() || null;
  const status = params.get('status')?.trim() || null;

  const conditions: string[] = [];
  const values: string[] = [];
  if (provider) { values.push(provider); conditions.push(`provider = $${values.length}`); }
  if (tag === UNTAGGED_FILTER) { conditions.push('tag IS NULL'); }
  else if (tag) { values.push(tag); conditions.push(`tag = $${values.length}`); }
  if (month && /^\d{4}-\d{2}$/.test(month)) { values.push(month); conditions.push(`TO_CHAR(invoice_date, 'YYYY-MM') = $${values.length}`); }
  if (status && STATUSES.has(status)) { values.push(status); conditions.push(`status = $${values.length}`); }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(`
    SELECT provider, invoice_number,
           TO_CHAR(billing_period_start, 'YYYY-MM-DD') AS billing_period_start,
           TO_CHAR(billing_period_end, 'YYYY-MM-DD') AS billing_period_end,
           TO_CHAR(invoice_date, 'YYYY-MM-DD') AS invoice_date,
           currency, amount::float8 AS amount, status, tag,
           is_recurring, recurrence_interval, file_name, file_type, file_data
    FROM expense_invoices
    ${whereClause}
    ORDER BY invoice_date ASC, created_at ASC
  `, values);

  const archive = new ZipArchive({ zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<void>((resolve, reject) => {
    archive.on('end', () => resolve());
    archive.on('error', reject);
  });

  const headers = ['Provider', 'Invoice #', 'Billing Period', 'Invoice Date', 'Currency', 'Amount', 'Status', 'Tag', 'File'];
  const tableRows: string[][] = [];

  const usedNames = new Set<string>();
  for (const row of result.rows) {
    let fileEntryName = '';
    if (row.file_data) {
      const ext = extensionFor(row.file_type);
      const base = sanitizeFilename(`${row.invoice_date}_${row.provider}_${row.invoice_number}`);
      let candidate = `${base}.${ext}`;
      let counter = 2;
      while (usedNames.has(candidate)) {
        candidate = `${base}_${counter}.${ext}`;
        counter += 1;
      }
      usedNames.add(candidate);
      fileEntryName = candidate;
      archive.append(row.file_data, { name: `files/${candidate}` });
    }

    const billingPeriod = row.billing_period_start && row.billing_period_end
      ? `${row.billing_period_start} to ${row.billing_period_end}`
      : '';

    tableRows.push([
      row.provider,
      row.invoice_number,
      billingPeriod,
      row.invoice_date,
      row.currency,
      Number(row.amount).toFixed(2),
      row.status,
      row.tag ?? '',
      fileEntryName,
    ].map(v => String(v).replace(/[\r\n]+/g, ' ')));
  }

  const totalsByCurrency = new Map<string, number>();
  for (const row of result.rows) totalsByCurrency.set(row.currency, (totalsByCurrency.get(row.currency) ?? 0) + Number(row.amount));

  const filterNotes: string[] = [];
  if (provider) filterNotes.push(`provider = ${provider}`);
  if (tag === UNTAGGED_FILTER) filterNotes.push('tag = Untagged');
  else if (tag) filterNotes.push(`tag = ${tag}`);
  if (month && /^\d{4}-\d{2}$/.test(month)) filterNotes.push(`month = ${month}`);
  if (status && STATUSES.has(status)) filterNotes.push(`status = ${status}`);

  const lines = [
    `Allerac expenses export — ${result.rows.length} invoice${result.rows.length === 1 ? '' : 's'}, generated ${new Date().toISOString().slice(0, 10)}`,
    ...(filterNotes.length ? [`Filters: ${filterNotes.join(', ')}`] : []),
    '',
    buildAsciiTable(headers, tableRows, new Set([5])),
    '',
    'Totals:',
    ...Array.from(totalsByCurrency.entries()).map(([currency, total]) => `  ${currency} ${total.toFixed(2)}`),
  ];

  archive.append(lines.join('\n'), { name: 'invoices.txt' });
  archive.finalize();
  await finished;

  const dateStamp = new Date().toISOString().slice(0, 10);
  return new Response(Buffer.concat(chunks), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="expenses-export-${dateStamp}.zip"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
