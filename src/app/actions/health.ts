'use server';

import pool from '@/app/clients/db';
import { encrypt, safeDecrypt } from '@/app/services/crypto/encryption.service';

const WORKER_URL = (process.env.HEALTH_WORKER_URL || 'http://health-worker:8001').replace(/\/$/, '');
const WORKER_SECRET = process.env.HEALTH_WORKER_SECRET || '';

export async function isHealthConfigured(): Promise<boolean> {
  return Boolean(WORKER_SECRET);
}

async function workerFetch(method: string, path: string, body?: object) {
  if (!WORKER_SECRET) throw new Error('Health worker not configured (HEALTH_WORKER_SECRET missing)');
  const res = await fetch(`${WORKER_URL}${path}`, {
    method,
    headers: {
      'X-Worker-Secret': WORKER_SECRET,
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

// ─── Garmin status ─────────────────────────────────────────────────────────────

export async function getGarminStatus(userId: string) {
  try {
    const res = await pool.query(
      'SELECT is_connected, mfa_pending, last_sync_at, last_error, sync_enabled FROM garmin_credentials WHERE user_id = $1',
      [userId]
    );
    if (res.rows.length === 0) {
      return { is_connected: false, mfa_pending: false, sync_enabled: false };
    }
    const row = res.rows[0];
    return {
      is_connected: row.is_connected,
      mfa_pending: row.mfa_pending,
      last_sync_at: row.last_sync_at,
      last_error: row.last_error,
      sync_enabled: row.sync_enabled,
    };
  } catch (e: any) {
    return { is_connected: false, error: e.message };
  }
}

// ─── Connect ───────────────────────────────────────────────────────────────────

export async function connectGarmin(userId: string, email: string, password: string) {
  const result = await workerFetch('POST', '/connect', { email, password });

  if (result.status === 'mfa_required') {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const sessionDataEncrypted = encrypt(JSON.stringify({ session_id: result.session_id }));

    await pool.query(
      `INSERT INTO health_mfa_sessions (user_id, garmin_email, session_data_encrypted, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         garmin_email = EXCLUDED.garmin_email,
         session_data_encrypted = EXCLUDED.session_data_encrypted,
         expires_at = EXCLUDED.expires_at`,
      [userId, email, sessionDataEncrypted, expiresAt]
    );

    await pool.query(
      `INSERT INTO garmin_credentials (user_id, email_encrypted, mfa_pending, is_connected)
       VALUES ($1, $2, true, false)
       ON CONFLICT (user_id) DO UPDATE SET
         email_encrypted = EXCLUDED.email_encrypted,
         mfa_pending = true,
         is_connected = false,
         updated_at = NOW()`,
      [userId, encrypt(email)]
    );

    return { is_connected: false, mfa_pending: true, message: 'MFA code required. Check your email or phone.' };
  }

  if (result.status === 'success') {
    await pool.query(
      `INSERT INTO garmin_credentials (user_id, email_encrypted, oauth1_token_encrypted, is_connected, mfa_pending)
       VALUES ($1, $2, $3, true, false)
       ON CONFLICT (user_id) DO UPDATE SET
         email_encrypted = EXCLUDED.email_encrypted,
         oauth1_token_encrypted = EXCLUDED.oauth1_token_encrypted,
         is_connected = true,
         mfa_pending = false,
         last_error = NULL,
         updated_at = NOW()`,
      [userId, encrypt(email), encrypt(result.session_dump)]
    );

    return { is_connected: true, mfa_pending: false };
  }

  throw new Error(`Unexpected response from worker: ${result.status}`);
}

// ─── MFA ───────────────────────────────────────────────────────────────────────

export async function submitGarminMfa(userId: string, mfaCode: string) {
  const res = await pool.query(
    'SELECT session_data_encrypted, expires_at FROM health_mfa_sessions WHERE user_id = $1',
    [userId]
  );

  if (res.rows.length === 0) {
    throw new Error('No pending MFA session. Please try connecting again.');
  }

  const session = res.rows[0];
  if (new Date(session.expires_at) < new Date()) {
    await pool.query('DELETE FROM health_mfa_sessions WHERE user_id = $1', [userId]);
    throw new Error('MFA session expired. Please try connecting again.');
  }

  const sessionData = JSON.parse(safeDecrypt(session.session_data_encrypted));
  const result = await workerFetch('POST', '/mfa', {
    session_id: sessionData.session_id,
    mfa_code: mfaCode,
  });

  if (result.status !== 'success') {
    throw new Error('Invalid MFA code');
  }

  await pool.query(
    `UPDATE garmin_credentials SET
       oauth1_token_encrypted = $2,
       is_connected = true,
       mfa_pending = false,
       last_error = NULL,
       updated_at = NOW()
     WHERE user_id = $1`,
    [userId, encrypt(result.session_dump)]
  );

  await pool.query('DELETE FROM health_mfa_sessions WHERE user_id = $1', [userId]);

  return { is_connected: true, mfa_pending: false };
}

// ─── Disconnect ────────────────────────────────────────────────────────────────

export async function disconnectGarmin(userId: string) {
  await pool.query('DELETE FROM garmin_credentials WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM health_mfa_sessions WHERE user_id = $1', [userId]);
  return { success: true };
}

// ─── Sync ──────────────────────────────────────────────────────────────────────

export async function triggerHealthSync(userId: string) {
  return _runSync(userId, 'manual', 2);
}

export async function triggerInitialSync(userId: string) {
  return _runSync(userId, 'full', 30);
}

async function _runSync(userId: string, jobType: 'manual' | 'full', days: number) {
  const res = await pool.query(
    'SELECT oauth1_token_encrypted, is_connected FROM garmin_credentials WHERE user_id = $1',
    [userId]
  );
  if (res.rows.length === 0 || !res.rows[0].is_connected) {
    throw new Error('Garmin not connected');
  }

  const sessionDump = safeDecrypt(res.rows[0].oauth1_token_encrypted);
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const jobRes = await pool.query(
    `INSERT INTO health_sync_jobs (user_id, status, job_type, started_at) VALUES ($1, 'running', $2, NOW()) RETURNING id`,
    [userId, jobType]
  );
  const jobId = jobRes.rows[0].id;

  try {
    const data = await workerFetch('POST', '/sync', {
      session_dump: sessionDump,
      start_date: startDate,
      end_date: endDate,
    });

    await _upsertMetrics(userId, data.metrics);

    await pool.query(
      `UPDATE health_sync_jobs SET status='completed', completed_at=NOW(), records_fetched=$2 WHERE id=$1`,
      [jobId, data.metrics.length]
    );
    await pool.query(
      `UPDATE garmin_credentials SET last_sync_at=NOW(), last_error=NULL, updated_at=NOW() WHERE user_id=$1`,
      [userId]
    );

    return { success: true, records: data.metrics.length };
  } catch (e: any) {
    await pool.query(
      `UPDATE health_sync_jobs SET status='failed', completed_at=NOW(), error_message=$2 WHERE id=$1`,
      [jobId, e.message]
    );
    await pool.query(
      `UPDATE garmin_credentials SET last_error=$2, updated_at=NOW() WHERE user_id=$1`,
      [userId, e.message]
    );
    throw e;
  }
}

// ─── Metrics queries ───────────────────────────────────────────────────────────

export async function getHealthMetrics(userId: string, startDate: string, endDate: string) {
  const res = await pool.query(
    `SELECT * FROM health_daily_metrics
     WHERE user_id = $1 AND date BETWEEN $2 AND $3
     ORDER BY date ASC`,
    [userId, startDate, endDate]
  );
  return res.rows;
}

export async function getHealthSummary(userId: string, period: 'day' | 'week' | 'month' | 'year') {
  const days = { day: 1, week: 7, month: 30, year: 365 }[period];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const res = await pool.query(
    `SELECT
       ROUND(AVG(steps))                              AS avg_steps,
       ROUND(AVG(calories))                           AS avg_calories,
       ROUND(AVG(resting_hr))                         AS avg_resting_hr,
       ROUND(AVG(sleep_duration_minutes) / 60.0, 1)  AS avg_sleep_hours,
       SUM(steps)                                     AS total_steps,
       SUM(calories)                                  AS total_calories,
       MAX(steps)                                     AS max_steps,
       COUNT(*)                                       AS days_with_data
     FROM health_daily_metrics
     WHERE user_id = $1 AND date >= $2`,
    [userId, since]
  );

  return { period, ...res.rows[0] };
}

export async function getDailySnapshot(userId: string, date: string) {
  const res = await pool.query(
    'SELECT * FROM health_daily_metrics WHERE user_id = $1 AND date = $2',
    [userId, date]
  );
  return res.rows[0] ?? null;
}

// ─── Internal ──────────────────────────────────────────────────────────────────

async function _upsertMetrics(userId: string, metrics: any[]) {
  for (const m of metrics) {
    await pool.query(
      `INSERT INTO health_daily_metrics (
         user_id, date,
         steps, calories, distance_meters, active_minutes, floors_climbed,
         resting_hr, avg_hr, max_hr,
         sleep_duration_minutes, sleep_deep_minutes, sleep_light_minutes,
         sleep_rem_minutes, sleep_awake_minutes, sleep_score,
         body_battery_min, body_battery_max, body_battery_end,
         body_battery_charged, body_battery_drained,
         stress_avg, stress_max, stress_rest_duration_minutes,
         hrv_weekly_avg, hrv_last_night, hrv_status
       ) VALUES (
         $1, $2,
         $3, $4, $5, $6, $7,
         $8, $9, $10,
         $11, $12, $13, $14, $15, $16,
         $17, $18, $19, $20, $21,
         $22, $23, $24,
         $25, $26, $27
       )
       ON CONFLICT (user_id, date) DO UPDATE SET
         steps                      = COALESCE(EXCLUDED.steps,                      health_daily_metrics.steps),
         calories                   = COALESCE(EXCLUDED.calories,                   health_daily_metrics.calories),
         distance_meters            = COALESCE(EXCLUDED.distance_meters,            health_daily_metrics.distance_meters),
         active_minutes             = COALESCE(EXCLUDED.active_minutes,             health_daily_metrics.active_minutes),
         floors_climbed             = COALESCE(EXCLUDED.floors_climbed,             health_daily_metrics.floors_climbed),
         resting_hr                 = COALESCE(EXCLUDED.resting_hr,                 health_daily_metrics.resting_hr),
         avg_hr                     = COALESCE(EXCLUDED.avg_hr,                     health_daily_metrics.avg_hr),
         max_hr                     = COALESCE(EXCLUDED.max_hr,                     health_daily_metrics.max_hr),
         sleep_duration_minutes     = COALESCE(EXCLUDED.sleep_duration_minutes,     health_daily_metrics.sleep_duration_minutes),
         sleep_deep_minutes         = COALESCE(EXCLUDED.sleep_deep_minutes,         health_daily_metrics.sleep_deep_minutes),
         sleep_light_minutes        = COALESCE(EXCLUDED.sleep_light_minutes,        health_daily_metrics.sleep_light_minutes),
         sleep_rem_minutes          = COALESCE(EXCLUDED.sleep_rem_minutes,          health_daily_metrics.sleep_rem_minutes),
         sleep_awake_minutes        = COALESCE(EXCLUDED.sleep_awake_minutes,        health_daily_metrics.sleep_awake_minutes),
         sleep_score                = COALESCE(EXCLUDED.sleep_score,                health_daily_metrics.sleep_score),
         body_battery_min           = COALESCE(EXCLUDED.body_battery_min,           health_daily_metrics.body_battery_min),
         body_battery_max           = COALESCE(EXCLUDED.body_battery_max,           health_daily_metrics.body_battery_max),
         body_battery_end           = COALESCE(EXCLUDED.body_battery_end,           health_daily_metrics.body_battery_end),
         body_battery_charged       = COALESCE(EXCLUDED.body_battery_charged,       health_daily_metrics.body_battery_charged),
         body_battery_drained       = COALESCE(EXCLUDED.body_battery_drained,       health_daily_metrics.body_battery_drained),
         stress_avg                 = COALESCE(EXCLUDED.stress_avg,                 health_daily_metrics.stress_avg),
         stress_max                 = COALESCE(EXCLUDED.stress_max,                 health_daily_metrics.stress_max),
         stress_rest_duration_minutes = COALESCE(EXCLUDED.stress_rest_duration_minutes, health_daily_metrics.stress_rest_duration_minutes),
         hrv_weekly_avg             = COALESCE(EXCLUDED.hrv_weekly_avg,             health_daily_metrics.hrv_weekly_avg),
         hrv_last_night             = COALESCE(EXCLUDED.hrv_last_night,             health_daily_metrics.hrv_last_night),
         hrv_status                 = COALESCE(EXCLUDED.hrv_status,                 health_daily_metrics.hrv_status),
         updated_at                 = NOW()`,
      [
        userId, m.date,
        m.steps ?? null, m.calories ?? null, m.distance_meters ?? null, m.active_minutes ?? null, m.floors_climbed ?? null,
        m.resting_hr ?? null, m.avg_hr ?? null, m.max_hr ?? null,
        m.sleep_duration_minutes ?? null, m.sleep_deep_minutes ?? null, m.sleep_light_minutes ?? null,
        m.sleep_rem_minutes ?? null, m.sleep_awake_minutes ?? null, m.sleep_score ?? null,
        m.body_battery_min ?? null, m.body_battery_max ?? null, m.body_battery_end ?? null,
        m.body_battery_charged ?? null, m.body_battery_drained ?? null,
        m.stress_avg ?? null, m.stress_max ?? null, m.stress_rest_duration_minutes ?? null,
        m.hrv_weekly_avg ?? null, m.hrv_last_night ?? null, m.hrv_status ?? null,
      ]
    );
  }
}
