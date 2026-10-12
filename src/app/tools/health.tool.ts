// Health data tool — queries health_daily_metrics directly from PostgreSQL.
// Used by the AI in conversations to surface Garmin health data.

import pool from '@/app/clients/db';
import { applyActivityCorrection } from '@/app/services/health/activity-corrections';
import { getConnection } from '@/app/services/integrations/integration-connections.service';

export interface HealthUser {
  id: string;
  email: string;
  name: string;
}

export interface HealthSummaryResult {
  period: string;
  avg_steps?: number;
  avg_calories?: number;
  avg_resting_hr?: number;
  avg_sleep_hours?: number;
  total_steps?: number;
  max_steps?: number;
  days_with_data?: number;
  garmin_connected: boolean;
  error?: string;
}

export interface HealthMetricsResult {
  daily_stats?: Array<{ date: string; steps: number | null; calories: number | null; distance_meters: number | null }>;
  heart_rate?: Array<{ date: string; resting_hr: number | null; avg_hr: number | null; max_hr: number | null }>;
  sleep?: Array<{ date: string; sleep_duration_minutes: number | null; sleep_deep_minutes: number | null; sleep_light_minutes: number | null; sleep_rem_minutes: number | null; sleep_score: number | null }>;
  body_battery?: Array<{ date: string; body_battery_max: number | null; body_battery_min: number | null; body_battery_end: number | null }>;
  error?: string;
}

export interface DailySnapshotResult {
  date: string;
  steps?: number | null;
  calories?: number | null;
  distance_meters?: number | null;
  resting_hr?: number | null;
  sleep_duration_minutes?: number | null;
  body_battery_end?: number | null;
  error?: string;
}

export interface GarminStatusResult {
  is_connected: boolean;
  last_sync_at?: string;
  error?: string;
}

export interface Activity {
  activityId?: string;
  activityName?: string;
  activityType?: string;
  startTimeInSeconds?: number;
  duration?: number;
  calories?: number;
  distance?: number;
  movingDuration?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  elevationGain?: number;
  elevationLoss?: number;
}

export interface ActivitySummary {
  date: string;
  name: string;
  type: string;
  duration_min: number;
  calories: number;
  distance_km?: number;
  avg_hr?: number;
  exercises?: string;
}

export interface RecentActivitiesResult {
  activities?: ActivitySummary[];
  error?: string;
}

export interface ActivityLapSummary {
  lap: number;
  duration_seconds: number | null;
  distance_meters: number | null;
  pace_seconds_per_km: number | null;
  avg_heart_rate: number | null;
  avg_power_watts: number | null;
  avg_cadence_spm: number | null;
}

export interface ActivityZoneSummary {
  metric: string;
  zone: number;
  duration_seconds: number | null;
  percent: number | null;
}

// Bounded per-activity detail for the assistant (laps, zones, running
// dynamics, training effect). Deliberately excludes GPS/route fields
// (coordinates, bounds, polyline) — per docs/roadmap/
// health-detailed-activities.md's "Assistant access"/"Privacy and security"
// sections, exact location data must never reach chat context.
export interface ActivityDetailResult {
  activity_id: string;
  name?: string;
  type?: string;
  date?: string;
  duration_seconds?: number | null;
  calories?: number | null;
  distance_meters?: number | null;
  avg_heart_rate?: number | null;
  max_heart_rate?: number | null;
  elevation_gain_meters?: number | null;
  average_pace_seconds_per_km?: number | null;
  average_power_watts?: number | null;
  average_cadence_spm?: number | null;
  average_stride_length_meters?: number | null;
  average_vertical_oscillation_cm?: number | null;
  average_vertical_ratio_percent?: number | null;
  average_ground_contact_time_ms?: number | null;
  estimated_sweat_loss_ml?: number | null;
  beginning_stamina_percent?: number | null;
  ending_stamina_percent?: number | null;
  training_effect_aerobic?: number | null;
  training_effect_anaerobic?: number | null;
  training_benefit?: string | null;
  exercise_load?: number | null;
  vo2_max?: number | null;
  laps?: ActivityLapSummary[];
  zones?: ActivityZoneSummary[];
  error?: string;
}

function compressActivity(a: any): ActivitySummary {
  const summary: ActivitySummary = {
    date: a.startTimeLocal ?? (a.startTimeInSeconds ? new Date(a.startTimeInSeconds * 1000).toISOString().split('T')[0] : '?'),
    name: a.activityName ?? a.activityType ?? 'Activity',
    type: a.activityType ?? 'unknown',
    duration_min: a.duration ? Math.round(a.duration / 60) : 0,
    calories: a.calories ? Math.round(a.calories) : 0,
  };
  if (a.distance && a.distance > 0) summary.distance_km = Math.round(a.distance / 100) / 10;
  if (a.avgHeartRate) summary.avg_hr = a.avgHeartRate;

  const sets: Array<{ category?: string; exercises?: Array<{ category?: string; reps?: number; sets?: number }> }> =
    a.summarizedExerciseSets ?? a.raw_data?.summarizedExerciseSets ?? [];
  if (sets.length > 0) {
    const counts: Record<string, number> = {};
    for (const s of sets) {
      const name = s.category ?? 'UNKNOWN';
      counts[name] = (counts[name] ?? 0) + 1;
    }
    summary.exercises = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => `${k}×${v}`)
      .join(', ');
  }
  return summary;
}

async function getActivitiesFromDatabase(
  userId: string,
  limit: number,
  startDate?: string,
  endDate?: string,
): Promise<any[]> {
  const params: Array<string | number> = [userId];
  let dateFilter = '';

  if (startDate && endDate) {
    params.push(startDate, endDate);
    dateFilter = 'AND date BETWEEN $2 AND $3';
  }
  params.push(limit);

  const result = await pool.query(
    `SELECT *
     FROM health_activities
     WHERE user_id = $1 ${dateFilter}
     ORDER BY date DESC, start_time_seconds DESC
     LIMIT $${params.length}`,
    params,
  );

  return result.rows.map((row: any) => ({
    ...applyActivityCorrection(row),
    activityId: row.activity_id,
    activityName: row.activity_name,
    activityType: row.activity_type,
    startTimeInSeconds: row.start_time_seconds ? Number(row.start_time_seconds) : null,
    startTimeLocal: row.start_time_local,
    duration: row.duration_seconds ? Number(row.duration_seconds) : null,
    calories: row.calories ? Number(row.calories) : null,
    distance: row.distance_meters ? Number(row.distance_meters) : null,
    avgHeartRate: row.avg_heart_rate ? Number(row.avg_heart_rate) : null,
  }));
}

export class HealthTool {

  get isConfigured(): boolean {
    return true; // Always available — reads from local PostgreSQL
  }

  async getSummary(user: HealthUser, period: string): Promise<HealthSummaryResult> {
    const validPeriods = ['day', 'week', 'month', 'year'] as const;
    const p = (validPeriods.includes(period as any) ? period : 'week') as typeof validPeriods[number];
    const days = { day: 1, week: 7, month: 30, year: 365 }[p];
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    try {
      const connected = await this._isConnected(user.id);
      if (!connected) return { period: p, garmin_connected: false };

      const res = await pool.query(
        `SELECT
           ROUND(AVG(steps))                             AS avg_steps,
           ROUND(AVG(calories))                          AS avg_calories,
           ROUND(AVG(resting_hr))                        AS avg_resting_hr,
           ROUND(AVG(sleep_duration_minutes) / 60.0, 1) AS avg_sleep_hours,
           SUM(steps)                                    AS total_steps,
           MAX(steps)                                    AS max_steps,
           COUNT(*)                                      AS days_with_data
         FROM health_daily_metrics
         WHERE user_id = $1 AND date >= $2`,
        [user.id, since]
      );
      const row = res.rows[0];
      return {
        period: p,
        garmin_connected: true,
        avg_steps: row.avg_steps != null ? Number(row.avg_steps) : undefined,
        avg_calories: row.avg_calories != null ? Number(row.avg_calories) : undefined,
        avg_resting_hr: row.avg_resting_hr != null ? Number(row.avg_resting_hr) : undefined,
        avg_sleep_hours: row.avg_sleep_hours != null ? Number(row.avg_sleep_hours) : undefined,
        total_steps: row.total_steps != null ? Number(row.total_steps) : undefined,
        max_steps: row.max_steps != null ? Number(row.max_steps) : undefined,
        days_with_data: Number(row.days_with_data),
      };
    } catch (e: any) {
      return { period: p, garmin_connected: false, error: e.message };
    }
  }

  async getMetrics(user: HealthUser, startDate: string, endDate: string): Promise<HealthMetricsResult> {
    try {
      const res = await pool.query(
        `SELECT * FROM health_daily_metrics
         WHERE user_id = $1 AND date BETWEEN $2 AND $3
         ORDER BY date ASC`,
        [user.id, startDate, endDate]
      );
      const rows = res.rows;
      return {
        daily_stats: rows.map(r => ({ date: r.date, steps: r.steps, calories: r.calories, distance_meters: r.distance_meters })),
        heart_rate: rows.map(r => ({ date: r.date, resting_hr: r.resting_hr, avg_hr: r.avg_hr, max_hr: r.max_hr })),
        sleep: rows.map(r => ({ date: r.date, sleep_duration_minutes: r.sleep_duration_minutes, sleep_deep_minutes: r.sleep_deep_minutes, sleep_light_minutes: r.sleep_light_minutes, sleep_rem_minutes: r.sleep_rem_minutes, sleep_score: r.sleep_score })),
        body_battery: rows.map(r => ({ date: r.date, body_battery_max: r.body_battery_max, body_battery_min: r.body_battery_min, body_battery_end: r.body_battery_end })),
      };
    } catch (e: any) {
      return { error: e.message };
    }
  }

  async getDailySnapshot(user: HealthUser, date: string): Promise<DailySnapshotResult> {
    try {
      const res = await pool.query(
        'SELECT * FROM health_daily_metrics WHERE user_id = $1 AND date = $2',
        [user.id, date]
      );
      if (res.rows.length === 0) return { date, error: 'No data for this date' };
      const r = res.rows[0];
      return {
        date,
        steps: r.steps,
        calories: r.calories,
        distance_meters: r.distance_meters,
        resting_hr: r.resting_hr,
        sleep_duration_minutes: r.sleep_duration_minutes,
        body_battery_end: r.body_battery_end,
      };
    } catch (e: any) {
      return { date, error: e.message };
    }
  }

  async getGarminStatus(user: HealthUser): Promise<GarminStatusResult> {
    try {
      const connection = await getConnection(user.id, 'garmin');
      if (!connection) return { is_connected: false };
      return {
        is_connected: connection.isConnected,
        last_sync_at: connection.lastSyncAt ? String(connection.lastSyncAt) : undefined,
      };
    } catch (e: any) {
      return { is_connected: false, error: e.message };
    }
  }

  async getRecentActivities(user: HealthUser, limit: number = 10, startDate?: string, endDate?: string): Promise<RecentActivitiesResult> {
    try {
      const raw = await getActivitiesFromDatabase(
        user.id,
        Math.min(limit, 50),
        startDate,
        endDate,
      );
      return { activities: raw.map(compressActivity) };
    } catch (e: any) {
      return { error: e.message };
    }
  }

  async getActivityDetail(user: HealthUser, activityId: string): Promise<ActivityDetailResult> {
    if (!/^\d+$/.test(activityId)) {
      return { activity_id: activityId, error: 'activityId must be numeric' };
    }
    try {
      const res = await pool.query(
        `SELECT activity_id, activity_name, activity_type, date, duration_seconds, calories,
                distance_meters, avg_heart_rate, max_heart_rate, elevation_gain,
                average_pace_seconds_per_km, average_power_watts, average_cadence_spm,
                average_stride_length_meters, average_vertical_oscillation_cm,
                average_vertical_ratio_percent, average_ground_contact_time_ms,
                estimated_sweat_loss_ml, beginning_stamina_percent, ending_stamina_percent,
                training_effect_aerobic, training_effect_anaerobic, training_benefit,
                exercise_load, vo2_max
         FROM health_activities
         WHERE user_id = $1 AND activity_id = $2`,
        [user.id, activityId],
      );
      if (res.rows.length === 0) {
        return { activity_id: activityId, error: 'Activity not found' };
      }
      // No exercise-set correction data was selected above (it's irrelevant
      // to laps/zones/dynamics) — applyActivityCorrection isn't needed here.
      const row = res.rows[0];

      const [lapsRes, zonesRes] = await Promise.all([
        pool.query(
          `SELECT lap_index, duration_seconds, distance_meters, pace_seconds_per_km,
                  average_heart_rate, average_power_watts, average_cadence_spm
           FROM health_activity_laps
           WHERE user_id = $1 AND activity_id = $2
           ORDER BY lap_index ASC`,
          [user.id, activityId],
        ),
        pool.query(
          `SELECT metric_type, zone_number, duration_seconds, percent
           FROM health_activity_zones
           WHERE user_id = $1 AND activity_id = $2
           ORDER BY metric_type ASC, zone_number ASC`,
          [user.id, activityId],
        ),
      ]);

      return {
        activity_id: row.activity_id,
        name: row.activity_name ?? row.activity_type ?? 'Activity',
        type: row.activity_type,
        date: row.date,
        duration_seconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
        calories: row.calories != null ? Number(row.calories) : null,
        distance_meters: row.distance_meters != null ? Number(row.distance_meters) : null,
        avg_heart_rate: row.avg_heart_rate != null ? Number(row.avg_heart_rate) : null,
        max_heart_rate: row.max_heart_rate != null ? Number(row.max_heart_rate) : null,
        elevation_gain_meters: row.elevation_gain != null ? Number(row.elevation_gain) : null,
        average_pace_seconds_per_km: row.average_pace_seconds_per_km != null ? Number(row.average_pace_seconds_per_km) : null,
        average_power_watts: row.average_power_watts != null ? Number(row.average_power_watts) : null,
        average_cadence_spm: row.average_cadence_spm != null ? Number(row.average_cadence_spm) : null,
        average_stride_length_meters: row.average_stride_length_meters != null ? Number(row.average_stride_length_meters) : null,
        average_vertical_oscillation_cm: row.average_vertical_oscillation_cm != null ? Number(row.average_vertical_oscillation_cm) : null,
        average_vertical_ratio_percent: row.average_vertical_ratio_percent != null ? Number(row.average_vertical_ratio_percent) : null,
        average_ground_contact_time_ms: row.average_ground_contact_time_ms != null ? Number(row.average_ground_contact_time_ms) : null,
        estimated_sweat_loss_ml: row.estimated_sweat_loss_ml != null ? Number(row.estimated_sweat_loss_ml) : null,
        beginning_stamina_percent: row.beginning_stamina_percent != null ? Number(row.beginning_stamina_percent) : null,
        ending_stamina_percent: row.ending_stamina_percent != null ? Number(row.ending_stamina_percent) : null,
        training_effect_aerobic: row.training_effect_aerobic != null ? Number(row.training_effect_aerobic) : null,
        training_effect_anaerobic: row.training_effect_anaerobic != null ? Number(row.training_effect_anaerobic) : null,
        training_benefit: row.training_benefit ?? null,
        exercise_load: row.exercise_load != null ? Number(row.exercise_load) : null,
        vo2_max: row.vo2_max != null ? Number(row.vo2_max) : null,
        laps: lapsRes.rows.map((l: any) => ({
          lap: l.lap_index,
          duration_seconds: l.duration_seconds != null ? Number(l.duration_seconds) : null,
          distance_meters: l.distance_meters != null ? Number(l.distance_meters) : null,
          pace_seconds_per_km: l.pace_seconds_per_km != null ? Number(l.pace_seconds_per_km) : null,
          avg_heart_rate: l.average_heart_rate != null ? Number(l.average_heart_rate) : null,
          avg_power_watts: l.average_power_watts != null ? Number(l.average_power_watts) : null,
          avg_cadence_spm: l.average_cadence_spm != null ? Number(l.average_cadence_spm) : null,
        })),
        zones: zonesRes.rows.map((z: any) => ({
          metric: z.metric_type,
          zone: z.zone_number,
          duration_seconds: z.duration_seconds != null ? Number(z.duration_seconds) : null,
          percent: z.percent != null ? Number(z.percent) : null,
        })),
      };
    } catch (e: any) {
      return { activity_id: activityId, error: e.message };
    }
  }

  private async _isConnected(userId: string): Promise<boolean> {
    const connection = await getConnection(userId, 'garmin');
    return connection?.isConnected === true;
  }
}
