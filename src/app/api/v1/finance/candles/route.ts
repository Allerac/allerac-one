import { z } from 'zod';
import { requireApiDomainUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import {
  type CandlePeriod,
  InvalidMarketDataInputError,
  MarketDataService,
} from '@/app/services/finance/market-data.service';

const marketDataService = new MarketDataService();

const querySchema = z.object({
  symbol: z.string().trim().min(1),
  period: z.enum(['1W', '1M', '6M']).default('1M'),
});

export async function GET(request: Request): Promise<Response> {
  try {
    await requireApiDomainUser('finance:read', 'finance', request);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid candles query', 400, parsed.error.flatten());
    }

    const candles = await marketDataService.getCandles(parsed.data.symbol, parsed.data.period as CandlePeriod);
    return apiData({ candles });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    if (error instanceof InvalidMarketDataInputError) {
      return apiError('validation_error', error.message, 400);
    }
    return apiInternalError('GET /api/v1/finance/candles failed', error);
  }
}
