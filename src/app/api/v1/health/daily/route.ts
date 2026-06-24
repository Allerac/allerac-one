import { z } from 'zod';
import pool from '@/app/clients/db';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';

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
    const res = await pool.query(
      'SELECT * FROM health_daily_metrics WHERE user_id = $1 AND date = $2',
      [user.id, date],
    );

    return apiData({ daily: res.rows[0] ?? null });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/health/daily failed', error);
  }
}
