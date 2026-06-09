// Health data tool — queries health_daily_metrics directly from PostgreSQL.
// Used by the AI in conversations to surface Garmin health data.

import pool from '@/app/clients/db';

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
    ...(row.raw_data
      ? (typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data)
      : {}),
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
      const res = await pool.query(
        'SELECT is_connected, last_sync_at FROM garmin_credentials WHERE user_id = $1',
        [user.id]
      );
      if (res.rows.length === 0) return { is_connected: false };
      return {
        is_connected: res.rows[0].is_connected,
        last_sync_at: res.rows[0].last_sync_at,
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

  private async _isConnected(userId: string): Promise<boolean> {
    const res = await pool.query(
      'SELECT is_connected FROM garmin_credentials WHERE user_id = $1',
      [userId]
    );
    return res.rows[0]?.is_connected === true;
  }
}
