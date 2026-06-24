import { z } from 'zod';
import pool from '@/app/clients/db';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';

const querySchema = z.object({
  period: z.enum(['day', '3days', 'week', 'month', 'year']).optional(),
});

const PERIOD_DAYS: Record<string, number> = { day: 1, '3days': 3, week: 7, month: 30, year: 365 };

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('health:read', request);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid period value', 400, parsed.error.flatten());
    }

    const period = parsed.data.period ?? 'week';
    const days = PERIOD_DAYS[period];
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const res = await pool.query(
      `SELECT
         ROUND(AVG(steps))                             AS avg_steps,
         ROUND(AVG(calories))                          AS avg_calories,
         ROUND(AVG(resting_hr))                        AS avg_resting_hr,
         ROUND(AVG(sleep_duration_minutes) / 60.0, 1) AS avg_sleep_hours,
         SUM(steps)                                    AS total_steps,
         SUM(calories)                                 AS total_calories,
         MAX(steps)                                    AS max_steps,
         COUNT(*)                                      AS days_with_data
       FROM health_daily_metrics
       WHERE user_id = $1 AND date >= $2`,
      [user.id, since],
    );

    return apiData({ summary: { period, ...res.rows[0] } });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/health/summary failed', error);
  }
}
