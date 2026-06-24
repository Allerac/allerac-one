import { z } from 'zod';
import pool from '@/app/clients/db';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';

const addSymbolSchema = z.object({
  symbol: z.string().trim().min(1),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('finance:read', request);
    const res = await pool.query(
      'SELECT symbol FROM user_watchlist WHERE user_id = $1 ORDER BY added_at ASC',
      [user.id],
    );
    return apiData({ symbols: res.rows.map((r: { symbol: string }) => r.symbol) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/finance/watchlist failed', error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('finance:write', request);
    const parsed = addSymbolSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'symbol is required', 400, parsed.error.flatten());
    }

    const symbol = parsed.data.symbol.toUpperCase().trim();
    await pool.query(
      'INSERT INTO user_watchlist (user_id, symbol) VALUES ($1, $2) ON CONFLICT (user_id, symbol) DO NOTHING',
      [user.id, symbol],
    );

    return apiData({ added: true, symbol }, { status: 201 });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/finance/watchlist failed', error);
  }
}
