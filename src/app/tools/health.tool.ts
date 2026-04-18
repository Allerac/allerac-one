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

export interface RecentActivitiesResult {
  activities?: Activity[];
  error?: string;
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

  async getRecentActivities(user: HealthUser, limit: number = 10): Promise<RecentActivitiesResult> {
    try {
      const endpoint = `/api/health/activities?limit=${Math.min(limit, 50)}`;
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}${endpoint}`, {
        headers: {
          Cookie: `session_token=${user.id}`,
        },
      });
      if (!response.ok) return { error: `API error: ${response.status}` };
      const data = await response.json();
      return { activities: data.activities };
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
