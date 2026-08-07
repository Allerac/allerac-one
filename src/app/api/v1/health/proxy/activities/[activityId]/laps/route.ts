import { requireApiUser } from '../../../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../../../_lib/responses';
import { GarminNotConnectedError, fetchProxyActivityDetails } from '@/app/services/health/health-proxy.service';

// Live read only — see ../route.ts. Same /activity-details worker call as
// every sibling proxy endpoint, sliced to just `laps`.
export async function GET(
  request: Request,
  context: { params: Promise<{ activityId: string }> },
): Promise<Response> {
  try {
    const user = await requireApiUser('health:proxy:read', request);
    const { activityId } = await context.params;
    if (!/^\d+$/.test(activityId)) {
      return apiError('validation_error', 'activityId must be numeric', 400);
    }

    const data = await fetchProxyActivityDetails(user.id, activityId);

    return apiData(
      {
        laps: data.laps ?? [],
        meta: { connector: 'garmin', operation: 'garmin.get_activity_details', dataMode: 'proxy', stored: false },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    if (error instanceof GarminNotConnectedError) {
      return apiError('garmin_not_connected', error.message, 409);
    }
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/health/proxy/activities/:id/laps failed', error);
  }
}
