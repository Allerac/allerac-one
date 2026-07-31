// Read-only queries against locally synced Garmin health data. Shared by the
// health Server Actions (src/app/actions/health.ts, used by the web UI) and
// the Control API v1 routes (src/app/api/v1/health/*, used by external
// API-key clients) so the SQL isn't duplicated between the two call paths —
// Server Actions can't be invoked with a Bearer token, so the API routes
// can't call them directly.

import pool from '@/app/clients/db';

// Calls the Python health-worker container, which holds the actual Garmin
// Connect client. Shared by the Server Actions (cached reads/writes) and the
// Control API v1 proxy routes (live reads, never persisted).
export async function callHealthWorker(method: string, path: string, body?: object) {
  // Read env vars at call time, not at module load — see the same note on
  // updateGarmin() in the exercise-sets route.
  const workerUrl = (process.env.HEALTH_WORKER_URL || 'http://health-worker:8001').replace(/\/$/, '');
  const workerSecret = process.env.HEALTH_WORKER_SECRET || '';
  if (!workerSecret) throw new Error('Health worker not configured (HEALTH_WORKER_SECRET missing)');
  const res = await fetch(`${workerUrl}${path}`, {
    method,
    headers: {
      'X-Worker-Secret': workerSecret,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Worker ${res.status}: ${text}`);
  }
  return res.json();
}

export interface GarminStatusRow {
  is_connected: boolean;
  mfa_pending: boolean;
  sync_enabled: boolean;
  last_sync_at: string | Date | null;
  last_error: string | null;
}

const DISCONNECTED_STATUS: GarminStatusRow = {
  is_connected: false,
  mfa_pending: false,
  sync_enabled: false,
  last_sync_at: null,
  last_error: null,
};

export async function queryGarminStatus(userId: string): Promise<GarminStatusRow> {
  const res = await pool.query(
    'SELECT is_connected, mfa_pending, last_sync_at, last_error, sync_enabled FROM garmin_credentials WHERE user_id = $1',
    [userId],
  );
  if (res.rows.length === 0) return { ...DISCONNECTED_STATUS };
  const row = res.rows[0];
  return {
    is_connected: row.is_connected,
    mfa_pending: row.mfa_pending,
    sync_enabled: row.sync_enabled,
    last_sync_at: row.last_sync_at,
    last_error: row.last_error,
  };
}

export type HealthSummaryPeriod = 'day' | '3days' | 'week' | 'month' | 'year';

export const HEALTH_SUMMARY_PERIOD_DAYS: Record<HealthSummaryPeriod, number> = {
  day: 1,
  '3days': 3,
  week: 7,
  month: 30,
  year: 365,
};

export async function queryHealthSummary(userId: string, period: HealthSummaryPeriod): Promise<Record<string, unknown>> {
  const days = HEALTH_SUMMARY_PERIOD_DAYS[period];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const res = await pool.query(
    `SELECT
       ROUND(AVG(steps))                             AS avg_steps,
       ROUND(AVG(calories))                          AS avg_calories,
       ROUND(AVG(resting_hr))                        AS avg_resting_hr,
       ROUND(AVG(sleep_duration_minutes) / 60.0, 1) AS avg_sleep_hours,
       SUM(steps)                                    AS total_steps,
       SUM(calories)                                 AS total_calories,
       MAX(steps)                                    AS max_steps,
       COUNT(*)                                       AS days_with_data
     FROM health_daily_metrics
     WHERE user_id = $1 AND date >= $2`,
    [userId, since],
  );

  return res.rows[0];
}

// Cache-only read of a single day's synced metrics — no live Garmin fetch.
// The Server Action wraps this with a live-fetch-and-cache-fill fallback on
// a cache miss (see actions/health.ts:getDailyHealth); the Control API
// deliberately stays read-only here and returns null on a miss rather than
// triggering a Garmin worker call as a side effect of a GET request.
export async function queryDailyMetricsSnapshot(userId: string, date: string): Promise<Record<string, unknown> | null> {
  const res = await pool.query(
    'SELECT * FROM health_daily_metrics WHERE user_id = $1 AND date = $2',
    [userId, date],
  );
  return res.rows[0] ?? null;
}
