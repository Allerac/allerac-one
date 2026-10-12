import { requireApiUser } from '../../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../../_lib/responses';
import { GarminNotConnectedError, fetchProxyActivityDetails } from '@/app/services/health/health-proxy.service';

// Live read only — never writes to health_activities/laps/zones/samples,
// never logged with payload content. See health-proxy.service.ts.
//
// Unlike /api/v1/health/activities/{activityId} (the cached/normalized
// contract), this is the raw provider passthrough: the health-worker's
// /activity-details response — laps, zones, samples, route bounds/polyline,
// and `details_raw` (Garmin's complete, unreduced payload) — is returned
// exactly as received, with no column whitelist and no redaction. Proxy
// mode's whole purpose is unstored, live, provider-neutral access, so
// callers here have already opted out of the privacy-redaction guarantees
// that apply to the cached path.
//
// This is the "give me everything in one call" endpoint; ./laps, ./zones,
// ./route, and ./series below expose the same data pre-sliced, matching the
// cached API's endpoint shape — each makes its own independent live call.
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
        ...data,
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
    return apiInternalError('GET /api/v1/health/proxy/activities/:id failed', error);
  }
}
