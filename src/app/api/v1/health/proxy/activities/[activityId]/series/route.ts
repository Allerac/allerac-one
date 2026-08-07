import { requireApiUser } from '../../../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../../../_lib/responses';
import { GarminNotConnectedError, fetchProxyActivityDetails } from '@/app/services/health/health-proxy.service';

// Live read only — see ../route.ts (the parent [activityId] handler). Same
// /activity-details worker call as every sibling proxy endpoint. Garmin's
// raw payload doesn't split "route samples" from "series samples" the way
// the cached, normalized tables do (see docs/roadmap/
// health-detailed-activities.md's Phase 3 "Route representation"), so this
// returns the exact same `samples` array as ../route/route.ts — including
// GPS coordinates, unlike the cached /series endpoint which never includes
// latitude/longitude. Kept as its own endpoint only for URL-shape parity
// with the cached API; prefer ../route if you only need one of the two.
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
        samples: data.samples ?? [],
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
    return apiInternalError('GET /api/v1/health/proxy/activities/:id/series failed', error);
  }
}
