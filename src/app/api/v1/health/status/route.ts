import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiInternalError } from '../../_lib/responses';
import { queryGarminStatus } from '@/app/services/health/health-query.service';

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('health:read', request);
    const row = await queryGarminStatus(user.id);

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
