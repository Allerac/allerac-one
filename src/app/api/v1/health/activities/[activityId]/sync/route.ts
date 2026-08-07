import pool from '@/app/clients/db';
import { requireApiUser } from '../../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../../_lib/responses';

// Queues (or re-queues) a Phase 2 detail sync for one activity — processed
// asynchronously by the detail-sync poll loop in src/agent-worker.ts (see
// src/app/services/health/detail-sync-runner.service.ts). Idempotent: safe
// to call repeatedly, and won't interrupt a job already 'running'.
export async function POST(
  request: Request,
  context: { params: Promise<{ activityId: string }> },
): Promise<Response> {
  try {
    const user = await requireApiUser('health:write', request);
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

    const job = await pool.query(
      `INSERT INTO health_activity_detail_sync_jobs (user_id, activity_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, activity_id) DO UPDATE SET
         status = CASE
           WHEN health_activity_detail_sync_jobs.status = 'running' THEN health_activity_detail_sync_jobs.status
           ELSE 'pending'
         END,
         last_error = CASE
           WHEN health_activity_detail_sync_jobs.status = 'running' THEN health_activity_detail_sync_jobs.last_error
           ELSE NULL
         END,
         updated_at = NOW()
       RETURNING status`,
      [user.id, activityId],
    );

    await pool.query(
      `UPDATE health_activities
       SET detail_sync_status = CASE WHEN detail_sync_status = 'syncing' THEN detail_sync_status ELSE 'pending' END,
           updated_at = NOW()
       WHERE user_id = $1 AND activity_id = $2`,
      [user.id, activityId],
    );

    return apiData(
      { activityId, queued: true, jobStatus: job.rows[0]?.status ?? 'pending' },
      { status: 202 },
    );
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/health/activities/:id/sync failed', error);
  }
}
