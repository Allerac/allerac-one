// Health data tool — calls the allerac-health API on behalf of the authenticated user.
//
// Required env vars:
//   HEALTH_API_URL         URL of the allerac-health backend (default: http://allerac-health-backend:8000)
//   HEALTH_API_SECRET_KEY  Shared secret used to sign health JWT tokens.
//                          Must match ALLERAC_ONE_SECRET_KEY in allerac-health .env.

import { createHmac } from 'crypto';

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
  steps_change?: number;
  calories_change?: number;
  garmin_connected: boolean;
  error?: string;
}

export interface HealthMetricsResult {
  daily_stats?: Array<{ date: string; steps: number; calories: number; distance: number }>;
  heart_rate?: Array<{ date: string; resting: number; avg: number; max: number }>;
  sleep?: Array<{ date: string; deep: number; light: number; rem: number; awake: number; duration: number }>;
  body_battery?: Array<{ date: string; max: number; min: number; end: number }>;
  error?: string;
}

export interface DailySnapshotResult {
  date: string;
  steps?: number;
  calories?: number;
  distance?: number;
  resting_hr?: number;
  sleep_hours?: number;
  body_battery_end?: number;
  error?: string;
}

export interface GarminStatusResult {
  is_connected: boolean;
  email?: string;
  last_sync_at?: string;
  error?: string;
}

export class HealthTool {
  private apiUrl: string;
  private secretKey: string;

  constructor() {
    this.apiUrl = (process.env.HEALTH_API_URL || 'http://allerac-health-backend:8000').replace(/\/$/, '');
    this.secretKey = process.env.HEALTH_API_SECRET_KEY || '';
  }

  get isConfigured(): boolean {
    return Boolean(this.secretKey);
  }

  /** Generate a short-lived HS256 JWT for the health API. */
  private createToken(user: HealthUser): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
      iss: 'allerac-one',
      sub: user.id,
      email: user.email,
      name: user.name,
      iat: now,
      exp: now + 600, // 10 minutes
    })).toString('base64url');
    const signature = createHmac('sha256', this.secretKey)
      .update(`${header}.${payload}`)
      .digest('base64url');
    return `${header}.${payload}.${signature}`;
  }

  private async get(user: HealthUser, path: string): Promise<any> {
    const token = this.createToken(user);
    const response = await fetch(`${this.apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Health API error ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  async getSummary(user: HealthUser, period: string): Promise<HealthSummaryResult> {
    const validPeriods = ['day', 'week', 'month', 'year'];
    const p = validPeriods.includes(period) ? period : 'week';
    try {
      const data = await this.get(user, `/api/v1/health/summary?period=${p}`);
      return {
        period: p,
        avg_steps: data.avg_steps != null ? Math.round(data.avg_steps) : undefined,
        avg_calories: data.avg_calories != null ? Math.round(data.avg_calories) : undefined,
        avg_resting_hr: data.avg_resting_hr != null ? Math.round(data.avg_resting_hr) : undefined,
        avg_sleep_hours: data.avg_sleep_hours != null ? Number(data.avg_sleep_hours.toFixed(1)) : undefined,
        steps_change: data.steps_change,
        calories_change: data.calories_change,
        garmin_connected: true,
      };
    } catch (e: any) {
      return { period: p, garmin_connected: false, error: e.message };
    }
  }

  async getMetrics(user: HealthUser, startDate: string, endDate: string): Promise<HealthMetricsResult> {
    try {
      const data = await this.get(user, `/api/v1/health/metrics?start_date=${startDate}&end_date=${endDate}`);
      return {
        daily_stats: data.daily_stats || [],
        heart_rate: data.heart_rate || [],
        sleep: data.sleep || [],
        body_battery: data.body_battery || [],
      };
    } catch (e: any) {
      return { error: e.message };
    }
  }

  async getDailySnapshot(user: HealthUser, date: string): Promise<DailySnapshotResult> {
    try {
      const data = await this.get(user, `/api/v1/health/daily/${date}`);
      return {
        date,
        steps: data.steps != null ? Math.round(data.steps) : undefined,
        calories: data.calories != null ? Math.round(data.calories) : undefined,
        distance: data.distance,
        resting_hr: data.resting_hr != null ? Math.round(data.resting_hr) : undefined,
        sleep_hours: data.sleep_hours != null ? Number(data.sleep_hours.toFixed(1)) : undefined,
        body_battery_end: data.body_battery_end,
      };
    } catch (e: any) {
      return { date, error: e.message };
    }
  }

  async getGarminStatus(user: HealthUser): Promise<GarminStatusResult> {
    try {
      const data = await this.get(user, '/api/v1/garmin/status');
      return {
        is_connected: data.is_connected,
        email: data.email,
        last_sync_at: data.last_sync_at,
      };
    } catch (e: any) {
      return { is_connected: false, error: e.message };
    }
  }
}
