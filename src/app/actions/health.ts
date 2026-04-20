'use server';

import pool from '@/app/clients/db';
import { encrypt, safeDecrypt } from '@/app/services/crypto/encryption.service';
import { submitLog } from '@/lib/submit-log';

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
  await submitLog('Health', `Garmin connect started for ${email}`);
  const result = await workerFetch('POST', '/connect', { email, password });

  if (result.status === 'mfa_required') {
    await submitLog('Health', `Garmin MFA required`);
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
    await submitLog('Health', `Garmin connected successfully`);
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
  await submitLog('Health', `Garmin MFA submitted`);
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

  await submitLog('Health', `Garmin MFA success — session saved`);
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

export async function triggerHealthSync(userId: string, days = 2) {
  return _runSync(userId, 'manual', days);
}

export async function triggerInitialSync(userId: string) {
  return _runSync(userId, 'full', 30);
}

async function _runSync(userId: string, jobType: 'manual' | 'full', days: number) {
  await submitLog('Health', '_runSync called');
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

  await submitLog('Health', `Sync started: ${startDate} → ${endDate} (${days} days)`);

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

    for (const m of data.metrics) {
      const parts: string[] = [];
      if (m.steps) parts.push(`steps: ${m.steps}`);
      if (m.calories) parts.push(`calories: ${m.calories}`);
      if (m.sleep_duration_minutes) parts.push(`sleep: ${Math.round(m.sleep_duration_minutes / 60)}h`);
      if (m.hrv_weekly_avg) parts.push(`hrv: ${m.hrv_weekly_avg}`);
      if (m.body_battery_max && m.body_battery_min) parts.push(`battery: ${m.body_battery_min}-${m.body_battery_max}`);
      if (parts.length > 0) {
        await submitLog('Health', `${m.date} → ${parts.join(' | ')}`);
      }
    }

    await _upsertMetrics(userId, data.metrics);

    // Also fetch and save activities for the sync period
    const allActivities: any[] = [];
    const current = new Date(startDate + 'T12:00:00');
    const end = new Date(endDate + 'T12:00:00');

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      try {
        const actData = await workerFetch('POST', '/activities', {
          session_dump: sessionDump,
          limit: 50,
          date: dateStr,
        });
        const activities = actData.activities || [];
        allActivities.push(...activities);
      } catch (e) {
        await submitLog('Health', `Warning: failed to fetch activities for ${dateStr} during sync`);
      }
      current.setDate(current.getDate() + 1);
    }

    if (allActivities.length > 0) {
      await _upsertActivities(userId, allActivities);
    }

    await submitLog('Health', `Sync complete: ${data.metrics.length} days + ${allActivities.length} activities synced`);

    await pool.query(
      `UPDATE health_sync_jobs SET status='completed', completed_at=NOW(), records_fetched=$2 WHERE id=$1`,
      [jobId, data.metrics.length + allActivities.length]
    );
    await pool.query(
      `UPDATE garmin_credentials SET last_sync_at=NOW(), last_error=NULL, updated_at=NOW() WHERE user_id=$1`,
      [userId]
    );

    return { success: true, records: data.metrics.length + allActivities.length };
  } catch (e: any) {
    await submitLog('Health', `Sync failed: ${e.message}`);
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
  // Try from database first
  const res = await pool.query(
    `SELECT * FROM health_daily_metrics
     WHERE user_id = $1 AND date BETWEEN $2 AND $3
     ORDER BY date ASC`,
    [userId, startDate, endDate]
  );

  const metrics = res.rows.map((row: any) => ({
    ...row,
    date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).split('T')[0],
  }));

  // If no data in database for this range, fetch from API
  if (metrics.length === 0) {
    await submitLog('Health', `No metrics in database for ${startDate} to ${endDate}, fetching from API`);
    const garminRes = await pool.query(
      'SELECT oauth1_token_encrypted, is_connected FROM garmin_credentials WHERE user_id = $1',
      [userId]
    );
    if (garminRes.rows.length > 0 && garminRes.rows[0].is_connected) {
      try {
        const sessionDump = safeDecrypt(garminRes.rows[0].oauth1_token_encrypted);
        const syncRes = await workerFetch('POST', '/sync', {
          session_dump: sessionDump,
          start_date: startDate,
          end_date: endDate,
        });
        await _upsertMetrics(userId, syncRes.metrics || []);
        await submitLog('Health', `Synced ${(syncRes.metrics || []).length} days and saved to database`);

        // Return fetched metrics
        return (syncRes.metrics || []).map((m: any) => ({
          ...m,
          date: String(m.date),
        }));
      } catch (e: any) {
        await submitLog('Health', `Warning: could not sync metrics from API: ${e.message}`);
      }
    }
  }

  return metrics;
}

export async function getHealthSummary(userId: string, period: 'day' | '3days' | 'week' | 'month' | 'year') {
  const days = { day: 1, '3days': 3, week: 7, month: 30, year: 365 }[period];
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

async function getActivitiesFromDB(userId: string, startDate: string, endDate: string) {
  const res = await pool.query(
    `SELECT * FROM health_activities
     WHERE user_id = $1 AND date BETWEEN $2 AND $3
     ORDER BY date DESC, start_time_seconds DESC`,
    [userId, startDate, endDate]
  );
  return res.rows.map((row: any) => {
    // Start with raw_data which has all the original fields
    const rawData = row.raw_data ? (typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data) : {};
    return {
      // Spread raw data to get all original fields (including summarizedExerciseSets, etc)
      ...rawData,
      // Override with normalized fields from DB
      activityId: row.activity_id,
      activityName: row.activity_name,
      activityType: row.activity_type,
      startTimeInSeconds: row.start_time_seconds ? Number(row.start_time_seconds) : null,
      startTimeLocal: row.start_time_local,
      duration: row.duration_seconds ? Number(row.duration_seconds) : null,
      calories: row.calories ? Number(row.calories) : null,
      distance: row.distance_meters ? Number(row.distance_meters) : null,
      avgHeartRate: row.avg_heart_rate ? Number(row.avg_heart_rate) : null,
      maxHeartRate: row.max_heart_rate ? Number(row.max_heart_rate) : null,
      elevationGain: row.elevation_gain ? Number(row.elevation_gain) : null,
      elevationLoss: row.elevation_loss ? Number(row.elevation_loss) : null,
    };
  });
}

// ─── Daily Health ──────────────────────────────────────────────────────────

export async function getDailyHealth(userId: string, date: string) {
  await submitLog('Health', `Fetching daily health for ${date}`);

  // Try cache first
  const cached = await getDailySnapshot(userId, date);
  if (cached) {
    await submitLog('Health', `Daily health from cache for ${date}`);
    return cached;
  }

  // Fetch from API
  const res = await pool.query(
    'SELECT oauth1_token_encrypted, is_connected FROM garmin_credentials WHERE user_id = $1',
    [userId]
  );
  if (res.rows.length === 0 || !res.rows[0].is_connected) {
    throw new Error('Garmin not connected');
  }

  const sessionDump = safeDecrypt(res.rows[0].oauth1_token_encrypted);
  const data = await workerFetch('POST', '/daily-health', {
    session_dump: sessionDump,
    date,
  });

  // Save to database
  await _upsertMetrics(userId, [{ date, ...data }]);
  await submitLog('Health', `Daily health retrieved and saved: ${Object.keys(data).length} fields`);
  return data;
}

export async function getActivitiesRange(userId: string, startDate: string, endDate: string) {
  await submitLog('Health', `Fetching activities from ${startDate} to ${endDate}`);

  // Try to get from database first
  const cachedActivities = await getActivitiesFromDB(userId, startDate, endDate);
  if (cachedActivities.length > 0) {
    await submitLog('Health', `Activities from cache: ${cachedActivities.length} activities`);
    return { activities: cachedActivities };
  }

  const res = await pool.query(
    'SELECT oauth1_token_encrypted, is_connected FROM garmin_credentials WHERE user_id = $1',
    [userId]
  );
  if (res.rows.length === 0 || !res.rows[0].is_connected) {
    throw new Error('Garmin not connected');
  }

  const sessionDump = safeDecrypt(res.rows[0].oauth1_token_encrypted);

  // Fetch activities for each day in range
  const allActivities: any[] = [];
  const current = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    try {
      const data = await workerFetch('POST', '/activities', {
        session_dump: sessionDump,
        limit: 50,
        date: dateStr,
      });
      const activities = data.activities || [];
      allActivities.push(...activities);
    } catch (e) {
      await submitLog('Health', `Warning: failed to fetch activities for ${dateStr}`);
    }
    current.setDate(current.getDate() + 1);
  }

  // Save to database
  if (allActivities.length > 0) {
    await _upsertActivities(userId, allActivities);
  }

  await submitLog('Health', `Activities retrieved and saved: ${allActivities.length} activities from ${startDate} to ${endDate}`);
  return { activities: allActivities };
}

// ─── Activities ────────────────────────────────────────────────────────────

export async function getRecentActivities(userId: string, limit: number = 10, filterDate?: string) {
  const filterMsg = filterDate ? ` for ${filterDate}` : '';
  await submitLog('Health', `Fetching recent activities (limit=${limit})${filterMsg}...`);

  // Try cache first if filtering by date
  let activities: any[] = [];
  if (filterDate) {
    const cached = await getActivitiesFromDB(userId, filterDate, filterDate);
    if (cached.length > 0) {
      await submitLog('Health', `Retrieved ${cached.length} activities from cache${filterMsg}`);
      return cached.slice(0, limit);
    }
  }

  const res = await pool.query(
    'SELECT oauth1_token_encrypted, is_connected FROM garmin_credentials WHERE user_id = $1',
    [userId]
  );
  if (res.rows.length === 0 || !res.rows[0].is_connected) {
    throw new Error('Garmin not connected');
  }

  const sessionDump = safeDecrypt(res.rows[0].oauth1_token_encrypted);
  await submitLog('Health', `Calling worker /activities endpoint${filterDate ? ` for ${filterDate}` : ''}...`);
  const data = await workerFetch('POST', '/activities', {
    session_dump: sessionDump,
    limit,
    date: filterDate || undefined
  });
  activities = data.activities ?? [];

  // Save to database if filtering by date
  if (filterDate && activities.length > 0) {
    await _upsertActivities(userId, activities);
  }

  // Limit to requested amount
  activities = activities.slice(0, limit);

  await submitLog('Health', `Retrieved and saved ${activities.length} activities${filterMsg}`);

  for (const activity of activities) {
    const details = [
      activity.activityName,
      `(${activity.activityType})`,
      activity.duration ? `${(activity.duration / 60000).toFixed(1)}min` : '',
      activity.calories ? `${Math.round(activity.calories)}cal` : '',
      activity.activeSets ? `${activity.activeSets} sets` : '',
    ]
      .filter(Boolean)
      .join(' ');

    await submitLog('Health', `  • ${details}`);

    if (activity.summarizedExerciseSets && activity.summarizedExerciseSets.length > 0) {
      for (const set of activity.summarizedExerciseSets.slice(0, 3)) {
        await submitLog('Health', `    - ${set.category}: ${set.reps} reps × ${set.sets} sets`);
      }
      if (activity.summarizedExerciseSets.length > 3) {
        await submitLog('Health', `    ... and ${activity.summarizedExerciseSets.length - 3} more exercises`);
      }
    }
  }

  return activities;
}

// ─── Internal ──────────────────────────────────────────────────────────────────

const toInt = (v: any) => (v != null ? Math.round(Number(v)) : null);

async function _upsertActivities(userId: string, activities: any[]) {
  for (const a of activities) {
    // Calculate date from startTimeLocal or startTimeInSeconds
    let activityDate: string | null = null;
    if (a.startTimeLocal) {
      activityDate = a.startTimeLocal.split('T')[0];
    } else if (a.startTimeInSeconds) {
      const ms = typeof a.startTimeInSeconds === 'string'
        ? parseInt(a.startTimeInSeconds) * 1000
        : a.startTimeInSeconds * 1000;
      activityDate = new Date(ms).toISOString().split('T')[0];
    }

    await pool.query(
      `INSERT INTO health_activities (
         user_id, activity_id, activity_name, activity_type, date,
         start_time_seconds, start_time_local,
         duration_seconds, calories, distance_meters,
         avg_heart_rate, max_heart_rate,
         elevation_gain, elevation_loss, raw_data
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (user_id, activity_id) DO UPDATE SET
         activity_name = COALESCE(EXCLUDED.activity_name, health_activities.activity_name),
         activity_type = COALESCE(EXCLUDED.activity_type, health_activities.activity_type),
         date = COALESCE(EXCLUDED.date, health_activities.date),
         start_time_seconds = COALESCE(EXCLUDED.start_time_seconds, health_activities.start_time_seconds),
         start_time_local = COALESCE(EXCLUDED.start_time_local, health_activities.start_time_local),
         duration_seconds = COALESCE(EXCLUDED.duration_seconds, health_activities.duration_seconds),
         calories = COALESCE(EXCLUDED.calories, health_activities.calories),
         distance_meters = COALESCE(EXCLUDED.distance_meters, health_activities.distance_meters),
         avg_heart_rate = COALESCE(EXCLUDED.avg_heart_rate, health_activities.avg_heart_rate),
         max_heart_rate = COALESCE(EXCLUDED.max_heart_rate, health_activities.max_heart_rate),
         elevation_gain = COALESCE(EXCLUDED.elevation_gain, health_activities.elevation_gain),
         elevation_loss = COALESCE(EXCLUDED.elevation_loss, health_activities.elevation_loss),
         raw_data = COALESCE(EXCLUDED.raw_data, health_activities.raw_data),
         updated_at = NOW()`,
      [
        userId, a.activityId, a.activityName, a.activityType,
        activityDate,
        a.startTimeInSeconds, a.startTimeLocal,
        a.duration, a.calories, a.distance,
        a.avgHeartRate, a.maxHeartRate,
        a.elevationGain, a.elevationLoss,
        JSON.stringify(a)
      ]
    );
  }
}

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
        toInt(m.steps), toInt(m.calories), toInt(m.distance_meters), toInt(m.active_minutes), toInt(m.floors_climbed),
        toInt(m.resting_hr), toInt(m.avg_hr), toInt(m.max_hr),
        toInt(m.sleep_duration_minutes), toInt(m.sleep_deep_minutes), toInt(m.sleep_light_minutes),
        toInt(m.sleep_rem_minutes), toInt(m.sleep_awake_minutes), toInt(m.sleep_score),
        toInt(m.body_battery_min), toInt(m.body_battery_max), toInt(m.body_battery_end),
        toInt(m.body_battery_charged), toInt(m.body_battery_drained),
        toInt(m.stress_avg), toInt(m.stress_max), toInt(m.stress_rest_duration_minutes),
        toInt(m.hrv_weekly_avg), toInt(m.hrv_last_night), m.hrv_status ?? null,
      ]
    );
  }
}
