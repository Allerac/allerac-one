import { z } from 'zod';
import pool from '@/app/clients/db';
import { requireApiUser } from '../../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../../_lib/responses';
import { queryProtectedLocations } from '@/app/services/health/health-query.service';
import { redactRouteSamples } from '@/app/services/health/route-redaction.service';

const querySchema = z.object({
  detail: z.enum(['true', 'false']).optional(),
});

const MAX_DETAIL_POINTS = 2000;

// Bounds + simplified polyline are always returned (cheap, Phase 3). Detailed
// coordinates are opt-in via ?detail=true, bounded to MAX_DETAIL_POINTS, and
// redacted near start/finish per the caller's protected locations — see
// docs/roadmap/health-detailed-activities.md's privacy section.
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

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid query parameters', 400, parsed.error.flatten());
    }

    const activityRes = await pool.query(
      `SELECT route_min_lat, route_max_lat, route_min_lon, route_max_lon,
              route_simplified_polyline, route_sample_count
       FROM health_activities WHERE user_id = $1 AND activity_id = $2`,
      [user.id, activityId],
    );
    if (activityRes.rows.length === 0) {
      return apiError('not_found', 'Activity not found', 404);
    }
    const activity = activityRes.rows[0];

    const response: Record<string, unknown> = {
      activityId,
      bounds: {
        minLat: activity.route_min_lat,
        maxLat: activity.route_max_lat,
        minLon: activity.route_min_lon,
        maxLon: activity.route_max_lon,
      },
      simplifiedPolyline: activity.route_simplified_polyline,
      sampleCount: activity.route_sample_count,
    };

    if (parsed.data.detail === 'true') {
      const samplesRes = await pool.query(
        `SELECT sample_index, timestamp, elapsed_seconds, latitude, longitude, elevation_meters
         FROM health_activity_samples
         WHERE user_id = $1 AND activity_id = $2
         ORDER BY sample_index ASC
         LIMIT $3`,
        [user.id, activityId, MAX_DETAIL_POINTS],
      );

      const zones = (await queryProtectedLocations(user.id)).map((z) => ({
        lat: z.lat, lng: z.lng, radiusMeters: z.radiusMeters,
      }));
      const { samples, redacted } = redactRouteSamples(
        samplesRes.rows.map((row: any) => ({
          ...row,
          latitude: row.latitude !== null ? Number(row.latitude) : null,
          longitude: row.longitude !== null ? Number(row.longitude) : null,
        })),
        zones,
      );

      response.coordinates = samples;
      response.redacted = redacted;
    }

    return apiData(response);
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/health/activities/:id/route failed', error);
  }
}
