// Read-only queries against locally synced Garmin health data. Shared by the
// health Server Actions (src/app/actions/health.ts, used by the web UI) and
// the Control API v1 routes (src/app/api/v1/health/*, used by external
// API-key clients) so the SQL isn't duplicated between the two call paths —
// Server Actions can't be invoked with a Bearer token, so the API routes
// can't call them directly.

import pool from '@/app/clients/db';
import { decrypt, safeDecrypt } from '@/app/services/crypto/encryption.service';
import { getConnection } from '@/app/services/integrations/integration-connections.service';

const GARMIN_PROVIDER = 'garmin';

// Loads the decrypted session dump plus whether this connection is in
// "proxy" mode (data_mode='proxy'). Proxy connections never get their live
// fetches written back to health_activities / health_daily_metrics.
// userId-parameterized (not session-bound), so it's also safe to import
// from src/agent-worker.ts's bundle — unlike actions/health.ts, this file
// never imports auth-session.ts (which pulls in bcrypt, a native addon
// esbuild can't bundle for that container).
export async function getGarminConnection(userId: string): Promise<{ sessionDump: string; isProxy: boolean } | null> {
  const connection = await getConnection(userId, GARMIN_PROVIDER);
  if (!connection || !connection.isConnected) return null;

  const res = await pool.query(
    'SELECT oauth1_token_encrypted FROM garmin_credentials WHERE user_id = $1',
    [userId],
  );
  if (res.rows.length === 0) return null;

  return {
    sessionDump: safeDecrypt(res.rows[0].oauth1_token_encrypted),
    isProxy: connection.dataMode === 'proxy',
  };
}

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
  data_mode: 'cached' | 'proxy';
}

const DISCONNECTED_STATUS: GarminStatusRow = {
  is_connected: false,
  mfa_pending: false,
  sync_enabled: false,
  last_sync_at: null,
  last_error: null,
  data_mode: 'cached',
};

export async function queryGarminStatus(userId: string): Promise<GarminStatusRow> {
  const [credRes, connRes] = await Promise.all([
    pool.query('SELECT mfa_pending FROM garmin_credentials WHERE user_id = $1', [userId]),
    pool.query(
      'SELECT is_connected, sync_enabled, last_sync_at, last_error, data_mode FROM integration_connections WHERE user_id = $1 AND provider = $2',
      [userId, 'garmin'],
    ),
  ]);
  if (credRes.rows.length === 0 && connRes.rows.length === 0) return { ...DISCONNECTED_STATUS };

  const conn = connRes.rows[0] ?? {};
  return {
    is_connected: conn.is_connected ?? false,
    mfa_pending: credRes.rows[0]?.mfa_pending ?? false,
    sync_enabled: conn.sync_enabled ?? true,
    last_sync_at: conn.last_sync_at ?? null,
    last_error: conn.last_error ?? null,
    data_mode: conn.data_mode ?? 'cached',
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

// Phase 3 privacy zones (docs/roadmap/health-detailed-activities.md).
// userId-parameterized (not session-bound) so both the Server Action
// (actions/health.ts:listProtectedLocations) and the Control API route/series
// endpoints — which resolve their user via requireApiUser, not a session
// cookie — can share this without duplicating the decrypt-and-map logic.
export interface ProtectedLocationRow {
  id: string;
  label: string | null;
  lat: number;
  lng: number;
  radiusMeters: number;
}

export async function queryProtectedLocations(userId: string): Promise<ProtectedLocationRow[]> {
  const res = await pool.query(
    `SELECT id, label, location_encrypted, radius_meters
     FROM health_protected_locations WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId],
  );
  return res.rows.map((row: any) => {
    const location = JSON.parse(decrypt(row.location_encrypted));
    return {
      id: row.id,
      label: row.label,
      lat: location.lat,
      lng: location.lng,
      radiusMeters: Number(row.radius_meters),
    };
  });
}
