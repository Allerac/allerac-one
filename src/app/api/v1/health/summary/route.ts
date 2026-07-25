import { z } from 'zod';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import { queryHealthSummary } from '@/app/services/health/health-query.service';

const querySchema = z.object({
  period: z.enum(['day', '3days', 'week', 'month', 'year']).optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('health:read', request);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid period value', 400, parsed.error.flatten());
    }

    const period = parsed.data.period ?? 'week';
    const summary = await queryHealthSummary(user.id, period);

    return apiData({ summary: { period, ...summary } });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/health/summary failed', error);
  }
}
