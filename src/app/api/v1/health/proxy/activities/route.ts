import { z } from 'zod';
import { requireApiUser } from '../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../_lib/responses';
import { callHealthWorker } from '@/app/services/health/health-query.service';
import { GarminNotConnectedError, requireGarminSessionDump } from '@/app/services/health/health-proxy.service';

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

// Live read only — never writes to health_activities, never logs activity
// content. See health-proxy.service.ts.
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('health:proxy:read', request);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'A date (YYYY-MM-DD) is required', 400, parsed.error.flatten());
    }

    const sessionDump = await requireGarminSessionDump(user.id);
    const data = await callHealthWorker('POST', '/activities', {
      session_dump: sessionDump,
      date: parsed.data.date,
      limit: parsed.data.limit ?? 20,
    });

    return apiData(
      {
        activities: data.activities ?? [],
        meta: { connector: 'garmin', operation: 'garmin.get_activities', dataMode: 'proxy', stored: false },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    if (error instanceof GarminNotConnectedError) {
      return apiError('garmin_not_connected', error.message, 409);
    }
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/health/proxy/activities failed', error);
  }
}
