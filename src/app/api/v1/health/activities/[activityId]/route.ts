import pool from '@/app/clients/db';
import { requireApiUser } from '../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../_lib/responses';
import { ACTIVITY_DETAIL_COLUMNS } from '../../_lib/columns';

// deleteActivity is session-scoped (getSessionUserId()), but ownership here
// comes from requireApiUser's key/session resolution + the WHERE user_id
// clause inside deleteActivity itself — same layering as every other Health
// route in this file tree.
async function deleteActivityForUser(userId: string, activityId: string): Promise<boolean> {
  const res = await pool.query(
    'DELETE FROM health_activities WHERE user_id = $1 AND activity_id = $2',
    [userId, activityId],
  );
  return (res.rowCount ?? 0) > 0;
}

// One activity's normalized detail (Phase 2 of docs/roadmap/
// health-detailed-activities.md). Laps/zones are separate endpoints so this
// stays a bounded, fast response — see ./laps/route.ts and ./zones/route.ts.
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

    const res = await pool.query(
      `SELECT ${ACTIVITY_DETAIL_COLUMNS} FROM health_activities WHERE user_id = $1 AND activity_id = $2`,
      [user.id, activityId],
    );
    if (res.rows.length === 0) {
      return apiError('not_found', 'Activity not found', 404);
    }

    return apiData({ activity: res.rows[0] });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/health/activities/:id failed', error);
  }
}

// Deletes one activity and all derived data (laps, zones, samples cascade
// via FK ON DELETE CASCADE — migrations 114, 116). 404 if nothing was
// deleted, so callers can distinguish "not yours"/"already gone" from a
// real failure.
export async function DELETE(
  request: Request,
  context: { params: Promise<{ activityId: string }> },
): Promise<Response> {
  try {
    const user = await requireApiUser('health:write', request);
    const { activityId } = await context.params;
    if (!/^\d+$/.test(activityId)) {
      return apiError('validation_error', 'activityId must be numeric', 400);
    }

    const deleted = await deleteActivityForUser(user.id, activityId);
    if (!deleted) {
      return apiError('not_found', 'Activity not found', 404);
    }

    return apiData({ activityId, deleted: true });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('DELETE /api/v1/health/activities/:id failed', error);
  }
}
