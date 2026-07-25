import { requireApiUser } from '../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../_lib/responses';
import { removeWatchlistSymbol } from '@/app/services/finance/watchlist-query.service';

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

    const deleted = await removeWatchlistSymbol(user.id, symbol);
    if (!deleted) {
      return apiError('not_found', 'Symbol not found in watchlist', 404);
    }

    return apiData({ deleted: true, symbol });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('DELETE /api/v1/finance/watchlist/:symbol failed', error);
  }
}
