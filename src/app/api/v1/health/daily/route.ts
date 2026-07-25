import { z } from 'zod';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import { queryDailyMetricsSnapshot } from '@/app/services/health/health-query.service';

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('health:read', request);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid date format', 400, parsed.error.flatten());
    }

    const date = parsed.data.date ?? new Date().toISOString().split('T')[0];
    // Cache-only read — does not trigger a live Garmin fetch on a miss (unlike
    // the web UI's getDailyHealth). See health-query.service.ts.
    const daily = await queryDailyMetricsSnapshot(user.id, date);

    return apiData({ daily });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/health/daily failed', error);
  }
}
