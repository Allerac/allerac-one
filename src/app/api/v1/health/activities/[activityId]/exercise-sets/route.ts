import { z } from 'zod';
import pool from '@/app/clients/db';
import { safeDecrypt } from '@/app/services/crypto/encryption.service';
import { requireApiUser } from '../../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../../_lib/responses';
import { getConnection } from '@/app/services/integrations/integration-connections.service';

const exerciseSchema = z.object({
  category: z.string().trim().min(1),
  name: z.string().trim().min(1).nullable().optional(),
  probability: z.number().min(0).max(100).optional(),
}).passthrough();

const setSchema = z.object({
  setType: z.enum(['ACTIVE', 'REST']),
  duration: z.number().nonnegative().nullable().optional(),
  repetitionCount: z.number().int().nonnegative().nullable().optional(),
  weight: z.number().nonnegative().nullable().optional(),
  exercises: z.array(exerciseSchema),
  startTime: z.string().nullable().optional(),
  wktStepIndex: z.number().int().nullable().optional(),
}).passthrough();

const bodySchema = z.object({
  exerciseSets: z.array(setSchema).min(1).max(500),
});

async function updateGarmin(sessionDump: string, activityId: string, exerciseSets: unknown[]) {
  // Read env vars at call time, not at module load — a module-level const
  // freezes whatever value was present when this module first loaded, which
  // made tests fragile (pass/fail depending on ambient .env state instead of
  // what the test itself configures).
  const workerUrl = (process.env.HEALTH_WORKER_URL || 'http://health-worker:8001').replace(/\/$/, '');
  const workerSecret = process.env.HEALTH_WORKER_SECRET || '';
  if (!workerSecret) throw new Error('Health worker not configured');
  const response = await fetch(`${workerUrl}/activities/exercise-sets`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Secret': workerSecret,
    },
    body: JSON.stringify({
      session_dump: sessionDump,
      activity_id: activityId,
      exercise_sets: exerciseSets,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`Garmin update failed (${response.status}): ${detail}`);
  }
  return response.json();
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ activityId: string }> },
): Promise<Response> {
  try {
    const user = await requireApiUser('health:write', request);
    const { activityId } = await context.params;
    if (!/^\d+$/.test(activityId)) {
      return apiError('validation_error', 'activityId must be numeric', 400);
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid exercise sets', 400, parsed.error.flatten());
    }

    const saved = await pool.query(
      `UPDATE health_activities
       SET corrected_exercise_sets = $3::jsonb,
           garmin_sync_status = 'pending',
           garmin_sync_error = NULL,
           correction_updated_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1 AND activity_id = $2
       RETURNING activity_id`,
      [user.id, activityId, JSON.stringify(parsed.data.exerciseSets)],
    );
    if (saved.rows.length === 0) {
      return apiError('not_found', 'Activity not found', 404);
    }

    let garminResult: unknown = null;
    try {
      const connection = await getConnection(user.id, 'garmin');
      const credentials = await pool.query(
        `SELECT oauth1_token_encrypted FROM garmin_credentials WHERE user_id = $1`,
        [user.id],
      );
      if (!connection?.isConnected || !credentials.rows[0]?.oauth1_token_encrypted) {
        throw new Error('Garmin is not connected');
      }
      garminResult = await updateGarmin(
        safeDecrypt(credentials.rows[0].oauth1_token_encrypted),
        activityId,
        parsed.data.exerciseSets,
      );
      await pool.query(
        `UPDATE health_activities
         SET garmin_sync_status = 'synced',
             garmin_sync_error = NULL,
             garmin_sync_attempts = garmin_sync_attempts + 1,
             updated_at = NOW()
         WHERE user_id = $1 AND activity_id = $2`,
        [user.id, activityId],
      );
      return apiData({
        activityId,
        localSaved: true,
        garminSyncStatus: 'synced',
        garmin: garminResult,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await pool.query(
        `UPDATE health_activities
         SET garmin_sync_status = 'garmin_sync_failed',
             garmin_sync_error = $3,
             garmin_sync_attempts = garmin_sync_attempts + 1,
             updated_at = NOW()
         WHERE user_id = $1 AND activity_id = $2`,
        [user.id, activityId, message.slice(0, 2000)],
      );
      return apiData({
        activityId,
        localSaved: true,
        garminSyncStatus: 'garmin_sync_failed',
        garminSyncError: message,
      });
    }
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('PUT /api/v1/health/activities/:id/exercise-sets failed', error);
  }
}
