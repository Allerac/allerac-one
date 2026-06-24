import pool from '@/app/clients/db';
import { requireApiUser } from '../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../_lib/responses';

interface RouteContext {
  params: Promise<{ symbol: string }>;
}

export async function DELETE(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const user = await requireApiUser('finance:write', request);
    const { symbol: rawSymbol } = await params;
    const symbol = rawSymbol.toUpperCase();

    const res = await pool.query(
      'DELETE FROM user_watchlist WHERE user_id = $1 AND symbol = $2',
      [user.id, symbol],
    );

    if ((res.rowCount ?? 0) === 0) {
      return apiError('not_found', 'Symbol not found in watchlist', 404);
    }

    return apiData({ deleted: true, symbol });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('DELETE /api/v1/finance/watchlist/:symbol failed', error);
  }
}
