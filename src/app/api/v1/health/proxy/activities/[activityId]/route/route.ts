import { requireApiUser } from '../../../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../../../_lib/responses';
import { GarminNotConnectedError, fetchProxyActivityDetails } from '@/app/services/health/health-proxy.service';

// Live read only — see ../route.ts (the parent [activityId] handler). Same
// /activity-details worker call as every sibling proxy endpoint, sliced to
// the route-shaped fields: bounds, simplified polyline, and the full sample
// array with exact GPS coordinates, unredacted (unlike the cached /route
// endpoint's optional redaction). Garmin's raw payload doesn't separate
// "route samples" from "series samples" the way the cached, normalized
// tables do — see ../series/route.ts, which returns this same array.
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
        route_bounds: data.route_bounds ?? null,
        route_simplified_polyline: data.route_simplified_polyline ?? null,
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
    return apiInternalError('GET /api/v1/health/proxy/activities/:id/route failed', error);
  }
}
