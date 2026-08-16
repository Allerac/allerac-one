import pool from '@/app/clients/db';
import { upsertConnection } from '@/app/services/integrations/integration-connections.service';
import { StravaActivity, StravaApiService } from './strava-api.service';
import { StravaCredentialsService } from './strava-credentials.service';

const MAPPER_VERSION = 1;

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function paceFromSpeed(speed: unknown): number | null {
  const value = numberOrNull(speed);
  return value && value > 0 ? 1000 / value : null;
}

export function logicalStravaActivityId(providerActivityId: string | number) {
  return `strava:${providerActivityId}`;
}

export function mapStravaActivity(activity: StravaActivity) {
  const activityId = logicalStravaActivityId(activity.id);
  const startSeconds = Math.floor(new Date(activity.start_date).getTime() / 1000);
  const activityType = activity.sport_type || activity.type || 'Activity';
  return {
    activityId,
    providerActivityId: String(activity.id),
    activityName: activity.name || activityType,
    activityType,
    date: activity.start_date_local.slice(0, 10),
    startTimeSeconds: Number.isFinite(startSeconds) ? startSeconds : null,
    startTimeLocal: activity.start_date_local,
    durationSeconds: numberOrNull(activity.elapsed_time),
    movingTimeSeconds: numberOrNull(activity.moving_time),
    elapsedTimeSeconds: numberOrNull(activity.elapsed_time),
    calories: numberOrNull(activity.calories),
    distanceMeters: numberOrNull(activity.distance),
    avgHeartRate: numberOrNull(activity.average_heartrate),
    maxHeartRate: numberOrNull(activity.max_heartrate),
    elevationGain: numberOrNull(activity.total_elevation_gain),
    averagePace: paceFromSpeed(activity.average_speed),
    bestPace: paceFromSpeed(activity.max_speed),
    averagePower: numberOrNull(activity.average_watts ?? activity.weighted_average_watts),
    maxPower: numberOrNull(activity.max_watts),
    minElevation: numberOrNull(activity.elev_low),
    maxElevation: numberOrNull(activity.elev_high),
    // Strava reports running cadence per leg; Health stores total steps/min,
    // matching Garmin's convention and what runners expect to see.
    averageCadence: numberOrNull(activity.average_cadence) != null
      ? numberOrNull(activity.average_cadence)! * (/run/i.test(activityType) ? 2 : 1)
      : null,
    timezone: activity.timezone ?? null,
    routePolyline: activity.map?.summary_polyline ?? null,
  };
}

export class StravaSyncService {
  constructor(
    private readonly api = new StravaApiService(),
    private readonly credentials = new StravaCredentialsService(api),
  ) {}

  async syncRecent(userId: string, options: { pages?: number; perPage?: number } = {}) {
    const accessToken = await this.credentials.getValidAccessToken(userId);
    if (!accessToken) throw new Error('Strava not connected');
    const pages = Math.min(10, Math.max(1, options.pages ?? 1));
    const perPage = Math.min(100, Math.max(1, options.perPage ?? 30));
    let imported = 0;

    try {
      for (let page = 1; page <= pages; page += 1) {
        const activities = await this.api.listActivities(accessToken, { page, perPage });
        for (const activity of activities) {
          await this.upsertActivity(userId, activity);
          imported += 1;
        }
        if (activities.length < perPage) break;
      }
      await upsertConnection(userId, 'strava', { lastSyncAt: new Date(), lastError: null });
      return { imported };
    } catch (error) {
      await upsertConnection(userId, 'strava', {
        lastError: error instanceof Error ? error.message.slice(0, 200) : 'strava_sync_failed',
      });
      throw error;
    }
  }

  async syncActivity(userId: string, providerActivityId: string) {
    const accessToken = await this.credentials.getValidAccessToken(userId);
    if (!accessToken) throw new Error('Strava not connected');
    const activity = await this.api.getActivity(accessToken, providerActivityId);
    await this.upsertActivity(userId, activity);
    return logicalStravaActivityId(activity.id);
  }

  private async upsertActivity(userId: string, raw: StravaActivity) {
    const a = mapStravaActivity(raw);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO health_activities (
           user_id, activity_id, provider, provider_activity_id, activity_name,
           activity_type, sport_type, date, start_time_seconds, start_time_local,
           duration_seconds, moving_time_seconds, elapsed_time_seconds, calories,
           distance_meters, avg_heart_rate, max_heart_rate, elevation_gain,
           average_pace_seconds_per_km, best_pace_seconds_per_km,
           average_power_watts, max_power_watts, min_elevation_meters,
           max_elevation_meters, average_cadence_spm, timezone, raw_data,
           payload_version, detail_sync_status, route_simplified_polyline
         ) VALUES (
           $1,$2,'strava',$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
           $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,'partial',$27
         )
         ON CONFLICT (user_id, activity_id) DO UPDATE SET
           activity_name=EXCLUDED.activity_name, activity_type=EXCLUDED.activity_type,
           sport_type=EXCLUDED.sport_type, date=EXCLUDED.date,
           start_time_seconds=EXCLUDED.start_time_seconds, start_time_local=EXCLUDED.start_time_local,
           duration_seconds=EXCLUDED.duration_seconds, moving_time_seconds=EXCLUDED.moving_time_seconds,
           elapsed_time_seconds=EXCLUDED.elapsed_time_seconds, calories=EXCLUDED.calories,
           distance_meters=EXCLUDED.distance_meters, avg_heart_rate=EXCLUDED.avg_heart_rate,
           max_heart_rate=EXCLUDED.max_heart_rate, elevation_gain=EXCLUDED.elevation_gain,
           average_pace_seconds_per_km=EXCLUDED.average_pace_seconds_per_km,
           best_pace_seconds_per_km=EXCLUDED.best_pace_seconds_per_km,
           average_power_watts=EXCLUDED.average_power_watts, max_power_watts=EXCLUDED.max_power_watts,
           min_elevation_meters=EXCLUDED.min_elevation_meters,
           max_elevation_meters=EXCLUDED.max_elevation_meters,
           average_cadence_spm=EXCLUDED.average_cadence_spm, timezone=EXCLUDED.timezone,
           raw_data=EXCLUDED.raw_data, payload_version=EXCLUDED.payload_version,
           route_simplified_polyline=COALESCE(EXCLUDED.route_simplified_polyline, health_activities.route_simplified_polyline),
           updated_at=NOW()`,
        [userId, a.activityId, a.providerActivityId, a.activityName, a.activityType,
         a.date, a.startTimeSeconds, a.startTimeLocal, a.durationSeconds, a.movingTimeSeconds,
         a.elapsedTimeSeconds, a.calories, a.distanceMeters, a.avgHeartRate, a.maxHeartRate,
         a.elevationGain, a.averagePace, a.bestPace, a.averagePower, a.maxPower,
         a.minElevation, a.maxElevation, a.averageCadence, a.timezone,
         JSON.stringify(raw), MAPPER_VERSION, a.routePolyline],
      );
      await client.query(
        `INSERT INTO health_activity_sources (
           user_id, activity_id, provider, provider_activity_id, provider_account_id,
           external_id, upload_id, visibility, source_device, summary_raw, mapper_version
         )
         SELECT $1,$2,'strava',$3,athlete_id::text,$4,$5,$6,$7,$8,$9
         FROM strava_credentials WHERE user_id=$1
         ON CONFLICT (user_id, provider, provider_activity_id) DO UPDATE SET
           activity_id=EXCLUDED.activity_id, external_id=EXCLUDED.external_id,
           upload_id=EXCLUDED.upload_id, visibility=EXCLUDED.visibility,
           source_device=EXCLUDED.source_device, summary_raw=EXCLUDED.summary_raw,
           mapper_version=EXCLUDED.mapper_version, last_synced_at=NOW(), deleted_at=NULL`,
        [userId, a.activityId, a.providerActivityId, raw.external_id ?? null,
         raw.upload_id != null ? String(raw.upload_id) : null,
         raw.visibility ?? (raw.private ? 'only_me' : null), raw.device_name ?? null,
         JSON.stringify(raw), MAPPER_VERSION],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
