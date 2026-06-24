import pool from '@/app/clients/db';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiInternalError } from '../../_lib/responses';

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('health:read', request);

    const res = await pool.query(
      'SELECT is_connected, mfa_pending, last_sync_at, last_error, sync_enabled FROM garmin_credentials WHERE user_id = $1',
      [user.id],
    );

    if (res.rows.length === 0) {
      return apiData({
        status: { isConnected: false, mfaPending: false, syncEnabled: false, lastSyncAt: null, lastError: null },
      });
    }

    const row = res.rows[0];
    return apiData({
      status: {
        isConnected: row.is_connected,
        mfaPending: row.mfa_pending,
        syncEnabled: row.sync_enabled,
        lastSyncAt: row.last_sync_at ?? null,
        lastError: row.last_error ?? null,
      },
    });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/health/status failed', error);
  }
}
