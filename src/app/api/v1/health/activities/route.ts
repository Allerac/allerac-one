import { z } from 'zod';
import pool from '@/app/clients/db';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('health:read', request);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid activity filters', 400, parsed.error.flatten());
    }

    const limit = parsed.data.limit ?? 10;
    const { date } = parsed.data;

    const res = date
      ? await pool.query(
          'SELECT * FROM health_activities WHERE user_id = $1 AND date = $2 ORDER BY start_time_seconds DESC LIMIT $3',
          [user.id, date, limit],
        )
      : await pool.query(
          'SELECT * FROM health_activities WHERE user_id = $1 ORDER BY date DESC, start_time_seconds DESC LIMIT $2',
          [user.id, limit],
        );

    return apiData({ activities: res.rows });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/health/activities failed', error);
  }
}
