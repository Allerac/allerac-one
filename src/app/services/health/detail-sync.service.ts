// Phase 2/3 detail sync (docs/roadmap/health-detailed-activities.md). Lives
// outside actions/health.ts ('use server') deliberately: this function takes
// a raw userId parameter instead of resolving it from a session, so it must
// never be reachable as a client-callable Server Action. Keeping it in a
// plain module also keeps auth-session.ts (and the bcrypt native addon it
// pulls in via auth.service.ts) out of src/agent-worker.ts's dependency-free
// esbuild bundle, which can't include native addons.
import pool from '@/app/clients/db';
import { callHealthWorker, getGarminConnection } from './health-query.service';

const workerFetch = callHealthWorker;

// Fetches laps + time-in-zone aggregates + route/samples for one activity
// and replaces them transactionally. Idempotent: safe to call repeatedly for
// the same activity (laps/zones/samples are deleted and reinserted, not
// appended). Called both by the manual "sync now" Control API route (via an
// enqueued job) and by the background poll loop in src/agent-worker.ts.
export async function runActivityDetailSync(userId: string, activityId: string) {
  const connection = await getGarminConnection(userId);
  if (!connection) {
    throw new Error('Garmin not connected');
  }
  if (connection.isProxy) {
    throw new Error('Detail sync is disabled for this connection — it is set to live/proxy mode.');
  }

  await pool.query(
    `UPDATE health_activities SET detail_sync_status = 'syncing', updated_at = NOW()
     WHERE user_id = $1 AND activity_id = $2`,
    [userId, activityId],
  );

  const data = await workerFetch('POST', '/activity-details', {
    session_dump: connection.sessionDump,
    activity_id: activityId,
  });

  const laps: any[] = data.laps ?? [];
  const zones: any[] = data.zones ?? [];
  const samples: any[] = data.samples ?? [];
  const routeBounds: Record<string, number | null> | null = data.route_bounds ?? null;
  const routeSimplifiedPolyline: string | null = data.route_simplified_polyline ?? null;
  const errors: Record<string, string> = data.errors ?? {};
  // One failed optional resource must not discard the activity summary —
  // 'partial' when some laps/zones/samples came through despite an error,
  // 'failed' only when nothing at all was retrievable.
  const hasErrors = Object.keys(errors).length > 0;
  const hasAnyData = laps.length > 0 || zones.length > 0 || samples.length > 0;
  const status: 'complete' | 'partial' | 'failed' = hasErrors
    ? (hasAnyData ? 'partial' : 'failed')
    : 'complete';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM health_activity_laps WHERE user_id = $1 AND activity_id = $2`,
      [userId, activityId],
    );
    await client.query(
      `DELETE FROM health_activity_zones WHERE user_id = $1 AND activity_id = $2`,
      [userId, activityId],
    );

    for (const lap of laps) {
      await client.query(
        `INSERT INTO health_activity_laps (
           user_id, activity_id, lap_index, start_offset_seconds, duration_seconds,
           distance_meters, pace_seconds_per_km, average_heart_rate, average_power_watts,
           average_cadence_spm, ascent_meters, descent_meters, raw_data
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          userId, activityId, lap.lap_index, lap.start_offset_seconds, lap.duration_seconds,
          lap.distance_meters, lap.pace_seconds_per_km, lap.average_heart_rate, lap.average_power_watts,
          lap.average_cadence_spm, lap.ascent_meters, lap.descent_meters,
          JSON.stringify(lap.raw_data ?? {}),
        ],
      );
    }

    for (const zone of zones) {
      await client.query(
        `INSERT INTO health_activity_zones (
           user_id, activity_id, metric_type, zone_number, lower_bound, upper_bound,
           duration_seconds, percent, raw_data
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          userId, activityId, zone.metric_type, zone.zone_number, zone.lower_bound, zone.upper_bound,
          zone.duration_seconds, zone.percent, JSON.stringify(zone.raw_data ?? {}),
        ],
      );
    }

    await client.query(
      `DELETE FROM health_activity_samples WHERE user_id = $1 AND activity_id = $2`,
      [userId, activityId],
    );

    // Bulk insert via UNNEST — samples can number in the thousands per
    // activity, unlike laps/zones' per-row loop above (doc: "Bulk upserts
    // should run in a transaction").
    if (samples.length > 0) {
      await client.query(
        `INSERT INTO health_activity_samples (
           user_id, activity_id, sample_index, timestamp, elapsed_seconds,
           latitude, longitude, elevation_meters, distance_meters,
           heart_rate_bpm, pace_seconds_per_km, speed_meters_per_second,
           power_watts, cadence_spm, stamina_percent, stamina_potential_percent,
           ground_contact_time_ms, stride_length_meters, vertical_oscillation_cm,
           run_walk_state
         )
         SELECT * FROM UNNEST(
           $1::uuid[], $2::varchar[], $3::int[], $4::bigint[], $5::numeric[],
           $6::numeric[], $7::numeric[], $8::numeric[], $9::numeric[],
           $10::numeric[], $11::numeric[], $12::numeric[],
           $13::numeric[], $14::numeric[], $15::numeric[], $16::numeric[],
           $17::numeric[], $18::numeric[], $19::numeric[],
           $20::varchar[]
         )`,
        [
          samples.map(() => userId),
          samples.map(() => activityId),
          samples.map((s: any) => s.sample_index),
          samples.map((s: any) => s.timestamp ?? null),
          samples.map((s: any) => s.elapsed_seconds ?? null),
          samples.map((s: any) => s.latitude ?? null),
          samples.map((s: any) => s.longitude ?? null),
          samples.map((s: any) => s.elevation_meters ?? null),
          samples.map((s: any) => s.distance_meters ?? null),
          samples.map((s: any) => s.heart_rate_bpm ?? null),
          samples.map((s: any) => s.pace_seconds_per_km ?? null),
          samples.map((s: any) => s.speed_meters_per_second ?? null),
          samples.map((s: any) => s.power_watts ?? null),
          samples.map((s: any) => s.cadence_spm ?? null),
          samples.map((s: any) => s.stamina_percent ?? null),
          samples.map((s: any) => s.stamina_potential_percent ?? null),
          samples.map((s: any) => s.ground_contact_time_ms ?? null),
          samples.map((s: any) => s.stride_length_meters ?? null),
          samples.map((s: any) => s.vertical_oscillation_cm ?? null),
          samples.map((s: any) => s.run_walk_state ?? null),
        ],
      );
    }

    await client.query(
      `UPDATE health_activities SET
         provider_details_raw = $3,
         detail_sync_status = $4,
         detail_synced_at = NOW(),
         route_min_lat = $5,
         route_max_lat = $6,
         route_min_lon = $7,
         route_max_lon = $8,
         route_simplified_polyline = $9,
         route_sample_count = $10,
         updated_at = NOW()
       WHERE user_id = $1 AND activity_id = $2`,
      [
        userId, activityId, JSON.stringify(data.details_raw ?? {}), status,
        routeBounds?.min_lat ?? null, routeBounds?.max_lat ?? null,
        routeBounds?.min_lon ?? null, routeBounds?.max_lon ?? null,
        routeSimplifiedPolyline, samples.length > 0 ? samples.length : null,
      ],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { status, laps: laps.length, zones: zones.length, samples: samples.length, errors };
}
