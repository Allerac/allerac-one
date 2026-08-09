import pool from '@/app/clients/db';
import { StravaApiService, StravaStream } from './strava-api.service';
import { StravaCredentialsService } from './strava-credentials.service';

function value(streams: Record<string, StravaStream>, key: string, index: number) {
  return streams[key]?.data?.[index] ?? null;
}

export async function runStravaDetailSync(userId: string, activityId: string, providerActivityId: string) {
  const api = new StravaApiService();
  const credentials = new StravaCredentialsService(api);
  const token = await credentials.getValidAccessToken(userId);
  if (!token) throw new Error('Strava not connected');

  await pool.query(`UPDATE health_activities SET detail_sync_status='syncing', updated_at=NOW()
                    WHERE user_id=$1 AND activity_id=$2`, [userId, activityId]);
  const details = await api.getActivity(token, providerActivityId);
  const streams = await api.getActivityStreams(token, providerActivityId).catch(() => ({}));
  const zones = await api.getActivityZones(token, providerActivityId).catch(() => []);
  const isRunning = /run/i.test(String(details.sport_type ?? details.type ?? ''));
  const sampleCount = Math.max(0, ...Object.values(streams).map((stream) => stream.data?.length ?? 0));
  const samples = Array.from({ length: sampleCount }, (_, index) => {
    const latlng = value(streams, 'latlng', index);
    const speed = Number(value(streams, 'velocity_smooth', index));
    const pace = Number.isFinite(speed) && speed > 0 ? 1000 / speed : null;
    // Near-zero velocities are pauses/GPS smoothing artefacts. They should
    // not expand a running chart to tens of thousands of seconds per km.
    const usablePace = pace != null && pace >= 120 && pace <= (isRunning ? 1200 : 3600) ? pace : null;
    const rawCadence = Number(value(streams, 'cadence', index));
    return {
      index,
      elapsed: value(streams, 'time', index),
      distance: value(streams, 'distance', index),
      latitude: Array.isArray(latlng) ? latlng[0] : null,
      longitude: Array.isArray(latlng) ? latlng[1] : null,
      altitude: value(streams, 'altitude', index),
      speed: Number.isFinite(speed) ? speed : null,
      pace: usablePace,
      heartRate: value(streams, 'heartrate', index),
      cadence: Number.isFinite(rawCadence) ? rawCadence * (isRunning ? 2 : 1) : null,
      watts: value(streams, 'watts', index),
      moving: value(streams, 'moving', index),
    };
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM health_activity_laps WHERE user_id=$1 AND activity_id=$2', [userId, activityId]);
    for (const [index, lap] of ((details.laps as any[]) ?? []).entries()) {
      const speed = Number(lap.average_speed);
      const rawCadence = Number(lap.average_cadence);
      await client.query(
        `INSERT INTO health_activity_laps (
           user_id,activity_id,lap_index,start_offset_seconds,duration_seconds,distance_meters,
           pace_seconds_per_km,average_heart_rate,average_power_watts,average_cadence_spm,
           ascent_meters,raw_data
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [userId, activityId, Number(lap.lap_index) || index + 1, lap.start_index ?? null,
         lap.elapsed_time ?? null, lap.distance ?? null,
         Number.isFinite(speed) && speed > 0 ? 1000 / speed : null,
         lap.average_heartrate ?? null, lap.average_watts ?? null,
         Number.isFinite(rawCadence) ? rawCadence * (isRunning ? 2 : 1) : null,
         lap.total_elevation_gain ?? null, JSON.stringify(lap)],
      );
    }
    await client.query('DELETE FROM health_activity_samples WHERE user_id=$1 AND activity_id=$2', [userId, activityId]);
    if (samples.length) {
      await client.query(
        `INSERT INTO health_activity_samples (
           user_id, activity_id, sample_index, elapsed_seconds, latitude, longitude,
           elevation_meters, distance_meters, heart_rate_bpm, pace_seconds_per_km,
           speed_meters_per_second, power_watts, cadence_spm, run_walk_state
         ) SELECT * FROM UNNEST(
           $1::uuid[],$2::varchar[],$3::int[],$4::numeric[],$5::numeric[],$6::numeric[],
           $7::numeric[],$8::numeric[],$9::numeric[],$10::numeric[],$11::numeric[],
           $12::numeric[],$13::numeric[],$14::varchar[])`,
        [samples.map(() => userId), samples.map(() => activityId), samples.map(s => s.index),
         samples.map(s => s.elapsed), samples.map(s => s.latitude), samples.map(s => s.longitude),
         samples.map(s => s.altitude), samples.map(s => s.distance), samples.map(s => s.heartRate),
         samples.map(s => s.pace), samples.map(s => s.speed), samples.map(s => s.watts),
         samples.map(s => s.cadence), samples.map(s => s.moving === false ? 'idle' : 'run')],
      );
    }
    await client.query('DELETE FROM health_activity_zones WHERE user_id=$1 AND activity_id=$2', [userId, activityId]);
    for (const zoneGroup of zones) {
      const type = String(zoneGroup.type ?? '').toLowerCase();
      const metric = type.includes('power')
        ? 'power'
        : (type.includes('heartrate') || type.includes('heart_rate') ? 'heart_rate' : null);
      if (!metric) continue;
      const buckets = (zoneGroup.distribution_buckets ?? [])
        .map((bucket: any, index: number) => ({ bucket, zoneNumber: index + 1 }))
        .filter(({ bucket }: any) => Number(bucket.time) > 0);
      const totalDuration = buckets.reduce((sum: number, { bucket }: any) => sum + Number(bucket.time ?? 0), 0);
      for (const { bucket, zoneNumber } of buckets) {
        const percent = totalDuration > 0 ? Number(bucket.time) * 100 / totalDuration : null;
        await client.query(
          `INSERT INTO health_activity_zones
           (user_id,activity_id,metric_type,zone_number,lower_bound,upper_bound,duration_seconds,percent,raw_data)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (user_id,activity_id,metric_type,zone_number) DO UPDATE SET
             lower_bound=EXCLUDED.lower_bound,
             upper_bound=EXCLUDED.upper_bound,
             duration_seconds=EXCLUDED.duration_seconds,
             percent=EXCLUDED.percent,
             raw_data=EXCLUDED.raw_data`,
          [userId, activityId, metric, zoneNumber, bucket.min ?? null, bucket.max ?? null,
           bucket.time ?? null, percent, JSON.stringify(bucket)],
        );
      }
    }
    const coordinates = samples.filter(s => s.latitude != null && s.longitude != null);
    await client.query(
      `UPDATE health_activities SET provider_details_raw=$3, detail_sync_status=$4,
       detail_synced_at=NOW(), route_min_lat=$5, route_max_lat=$6,
       route_min_lon=$7, route_max_lon=$8, route_sample_count=$9,
       average_cadence_spm=COALESCE($10,average_cadence_spm),
       relative_effort=$11, perceived_exertion=$12,
       weighted_average_power_watts=$13, energy_kilojoules=$14,
       source_device=$15, best_effort_count=$16, updated_at=NOW()
       WHERE user_id=$1 AND activity_id=$2`,
      [userId, activityId, JSON.stringify({ details, stream_metadata: Object.fromEntries(
        Object.entries(streams).map(([key, stream]) => [key, { original_size: stream.original_size, resolution: stream.resolution, series_type: stream.series_type }]),
      ) }), samples.length ? 'complete' : 'partial',
       coordinates.length ? Math.min(...coordinates.map(s => Number(s.latitude))) : null,
       coordinates.length ? Math.max(...coordinates.map(s => Number(s.latitude))) : null,
       coordinates.length ? Math.min(...coordinates.map(s => Number(s.longitude))) : null,
       coordinates.length ? Math.max(...coordinates.map(s => Number(s.longitude))) : null,
       coordinates.length,
       typeof details.average_cadence === 'number'
         ? details.average_cadence * (isRunning ? 2 : 1)
         : null,
       details.suffer_score ?? null, details.perceived_exertion ?? null,
       details.weighted_average_watts ?? null, details.kilojoules ?? null,
       details.device_name ?? null,
       Array.isArray(details.best_efforts) ? details.best_efforts.length : null],
    );
    await client.query(
      `UPDATE health_activity_sources SET details_raw=$4,last_synced_at=NOW()
       WHERE user_id=$1 AND activity_id=$2 AND provider='strava' AND provider_activity_id=$3`,
      [userId, activityId, providerActivityId, JSON.stringify(details)],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return { status: samples.length ? 'complete' : 'partial', samples: samples.length, zones: zones.length, laps: 0, errors: {} };
}
