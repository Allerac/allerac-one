/**
 * GET /api/expenses/[id]/file — streams the attached invoice PDF/image back.
 *
 * Auth: admin session.
 */

import { NextRequest } from 'next/server';
import pool from '@/app/clients/db';
import { authenticationErrorResponse, requireCurrentAdmin } from '@/app/lib/auth-session';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await requireCurrentAdmin();
  } catch (error) {
    const authError = authenticationErrorResponse(error, { format: 'text' });
    if (authError) return authError;
    return new Response('Authentication failed', { status: 500 });
  }

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return new Response('Invalid invoice ID', { status: 400 });

  const result = await pool.query(
    'SELECT file_name, file_type, file_data FROM expense_invoices WHERE id = $1',
    [id]
  );
  const row = result.rows[0];
  if (!row?.file_data) return new Response('File not found', { status: 404 });

  return new Response(row.file_data, {
    headers: {
      'Content-Type': row.file_type || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${(row.file_name || 'invoice').replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
