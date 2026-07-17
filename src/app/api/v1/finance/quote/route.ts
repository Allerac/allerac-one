import { z } from 'zod';
import { requireApiDomainUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import { InvalidMarketDataInputError, MarketDataService } from '@/app/services/finance/market-data.service';

const marketDataService = new MarketDataService();

const querySchema = z.object({
  symbols: z.string().optional(),
  q: z.string().trim().optional(),
}).refine((value) => Boolean(value.symbols || value.q), {
  message: 'symbols or q is required',
});

export async function GET(request: Request): Promise<Response> {
  try {
    await requireApiDomainUser('finance:read', 'finance', request);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid quote query', 400, parsed.error.flatten());
    }

    if (parsed.data.q) {
      const result = await marketDataService.searchSymbols(parsed.data.q);
      return apiData({ result });
    }

    const quotes = await marketDataService.getQuotes(parsed.data.symbols!.split(','));
    return apiData({ quotes });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    if (error instanceof InvalidMarketDataInputError) {
      return apiError('validation_error', error.message, 400);
    }
    return apiInternalError('GET /api/v1/finance/quote failed', error);
  }
}
