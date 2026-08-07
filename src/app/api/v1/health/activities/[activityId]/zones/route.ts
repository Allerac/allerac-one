import pool from '@/app/clients/db';
import { requireApiUser } from '../../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../../_lib/responses';

export async function GET(
  request: Request,
  context: { params: Promise<{ activityId: string }> },
): Promise<Response> {
  try {
    const user = await requireApiUser('health:read', request);
    const { activityId } = await context.params;
    if (!/^\d+$/.test(activityId)) {
      return apiError('validation_error', 'activityId must be numeric', 400);
    }

    const owns = await pool.query(
      'SELECT activity_id FROM health_activities WHERE user_id = $1 AND activity_id = $2',
      [user.id, activityId],
    );
    if (owns.rows.length === 0) {
      return apiError('not_found', 'Activity not found', 404);
    }

    const zones = await pool.query(
      `SELECT metric_type, zone_number, lower_bound, upper_bound, duration_seconds, percent
       FROM health_activity_zones
       WHERE user_id = $1 AND activity_id = $2
       ORDER BY metric_type ASC, zone_number ASC`,
      [user.id, activityId],
    );

    return apiData({ activityId, zones: zones.rows });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/health/activities/:id/zones failed', error);
  }
}
