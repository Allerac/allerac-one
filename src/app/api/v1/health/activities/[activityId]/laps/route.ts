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

    const laps = await pool.query(
      `SELECT lap_index, start_offset_seconds, duration_seconds, distance_meters,
              pace_seconds_per_km, average_heart_rate, average_power_watts,
              average_cadence_spm, ascent_meters, descent_meters
       FROM health_activity_laps
       WHERE user_id = $1 AND activity_id = $2
       ORDER BY lap_index ASC`,
      [user.id, activityId],
    );

    return apiData({ activityId, laps: laps.rows });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/health/activities/:id/laps failed', error);
  }
}
