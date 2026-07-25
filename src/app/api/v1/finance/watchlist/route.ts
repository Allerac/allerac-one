import { z } from 'zod';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import { addWatchlistSymbol, queryWatchlist } from '@/app/services/finance/watchlist-query.service';

const addSymbolSchema = z.object({
  symbol: z.string().trim().min(1),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('finance:read', request);
    const symbols = await queryWatchlist(user.id);
    return apiData({ symbols });
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
    await addWatchlistSymbol(user.id, symbol);

    return apiData({ added: true, symbol }, { status: 201 });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/finance/watchlist failed', error);
  }
}
