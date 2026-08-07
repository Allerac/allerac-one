import { z } from 'zod';
import pool from '@/app/clients/db';
import { requireApiUser } from '../../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../../_lib/responses';
import { queryProtectedLocations } from '@/app/services/health/health-query.service';
import { redactRouteSamples } from '@/app/services/health/route-redaction.service';

// Maps the public metric names callers select via ?metrics= to their
// health_activity_samples columns. Never includes latitude/longitude —
// that's /route's job; this endpoint only ever returns non-geo series.
const METRIC_COLUMNS: Record<string, string> = {
  heart_rate: 'heart_rate_bpm',
  pace: 'pace_seconds_per_km',
  speed: 'speed_meters_per_second',
  power: 'power_watts',
  cadence: 'cadence_spm',
  elevation: 'elevation_meters',
  distance: 'distance_meters',
  stamina: 'stamina_percent',
  ground_contact_time: 'ground_contact_time_ms',
  stride_length: 'stride_length_meters',
  vertical_oscillation: 'vertical_oscillation_cm',
};

const querySchema = z.object({
  metrics: z.string().optional(),
  maxPoints: z.coerce.number().int().min(10).max(5000).optional(),
});

// Bounded, downsampled time-series for selected metrics (Phase 3). Fetches
// latitude/longitude internally (never returned) purely to apply the same
// start/end privacy-zone redaction as /route, so a chart can't leak "the
// first N seconds were near a protected location" via elapsed_seconds.
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

    const requestedMetrics = parsed.data.metrics
      ? parsed.data.metrics.split(',').map((m) => m.trim()).filter(Boolean)
      : Object.keys(METRIC_COLUMNS);
    const unknown = requestedMetrics.filter((m) => !(m in METRIC_COLUMNS));
    if (unknown.length > 0) {
      return apiError('validation_error', `Unknown metric(s): ${unknown.join(', ')}`, 400, {
        supported: Object.keys(METRIC_COLUMNS),
      });
    }
    const maxPoints = parsed.data.maxPoints ?? 500;

    const owns = await pool.query(
      'SELECT activity_id FROM health_activities WHERE user_id = $1 AND activity_id = $2',
      [user.id, activityId],
    );
    if (owns.rows.length === 0) {
      return apiError('not_found', 'Activity not found', 404);
    }

    const columns = requestedMetrics.map((m) => METRIC_COLUMNS[m]);
    const samplesRes = await pool.query(
      `SELECT sample_index, elapsed_seconds, latitude, longitude, ${columns.join(', ')}
       FROM health_activity_samples
       WHERE user_id = $1 AND activity_id = $2
       ORDER BY sample_index ASC`,
      [user.id, activityId],
    );

    const zones = (await queryProtectedLocations(user.id)).map((z) => ({
      lat: z.lat, lng: z.lng, radiusMeters: z.radiusMeters,
    }));
    const { samples: redactedSamples, redacted } = redactRouteSamples(
      samplesRes.rows.map((row: any) => ({
        ...row,
        latitude: row.latitude !== null ? Number(row.latitude) : null,
        longitude: row.longitude !== null ? Number(row.longitude) : null,
      })),
      zones,
    );

    const stride = Math.max(1, Math.ceil(redactedSamples.length / maxPoints));
    const points = redactedSamples
      .filter((_: unknown, i: number) => i % stride === 0)
      .map(({ latitude, longitude, ...rest }: any) => rest);

    return apiData({
      activityId,
      metrics: requestedMetrics,
      redacted,
      totalSamples: samplesRes.rows.length,
      points,
    });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/health/activities/:id/series failed', error);
  }
}
