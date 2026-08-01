'use server';

import pool from '@/app/clients/db';
import { requireCurrentUser } from '@/app/lib/auth-session';
import { encrypt, safeDecrypt } from '@/app/services/crypto/encryption.service';
import { submitLog } from '@/lib/submit-log';
import { applyActivityCorrection } from '@/app/services/health/activity-corrections';
import { callHealthWorker, queryDailyMetricsSnapshot, queryGarminStatus, queryHealthSummary } from '@/app/services/health/health-query.service';
import { clearConnection, getConnection, upsertConnection } from '@/app/services/integrations/integration-connections.service';

const GARMIN_PROVIDER = 'garmin';

export async function isHealthConfigured(): Promise<boolean> {
  return Boolean(process.env.HEALTH_WORKER_SECRET);
}

async function getSessionUserId(): Promise<string> {
  const user = await requireCurrentUser();
  return user.id;
}

const workerFetch = callHealthWorker;

// Loads the decrypted session dump plus whether this connection is in
// "proxy" mode (data_mode='proxy'). Proxy connections never get their live
// fetches written back to health_activities / health_daily_metrics — see
// callers below. Returns null when Garmin isn't connected.
async function getGarminConnection(userId: string): Promise<{ sessionDump: string; isProxy: boolean } | null> {
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

// ─── Garmin status ─────────────────────────────────────────────────────────────

export async function getGarminStatus() {
  const userId = await getSessionUserId();
  try {
    return await queryGarminStatus(userId);
  } catch (e: any) {
    return {
      is_connected: false,
      mfa_pending: false,
      sync_enabled: false,
      last_sync_at: null,
      last_error: null,
      data_mode: 'cached' as const,
      error: e.message,
    };
  }
}

// ─── Connect ───────────────────────────────────────────────────────────────────

export async function connectGarmin(email: string, password: string, dataMode: 'cached' | 'proxy' = 'cached') {
  const userId = await getSessionUserId();
  await submitLog('Health', `Garmin connect started for ${email}`);
  const result = await workerFetch('POST', '/connect', { email, password });

  // Only apply the chosen data_mode on a genuinely new connection — a
  // reconnect (e.g. after a Garmin session expiry) must never silently
  // change an existing connection's mode, regardless of what the form
  // happens to submit this time.
  const existingConnection = await getConnection(userId, GARMIN_PROVIDER);
  const dataModeForUpsert = existingConnection ? undefined : dataMode;

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
      `INSERT INTO garmin_credentials (user_id, email_encrypted, mfa_pending)
       VALUES ($1, $2, true)
       ON CONFLICT (user_id) DO UPDATE SET
         email_encrypted = EXCLUDED.email_encrypted,
         mfa_pending = true,
         updated_at = NOW()`,
      [userId, encrypt(email)]
    );
    await upsertConnection(userId, GARMIN_PROVIDER, { isConnected: false, dataMode: dataModeForUpsert, lastError: null });

    return { is_connected: false, mfa_pending: true, message: 'MFA code required. Check your email or phone.' };
  }

  if (result.status === 'success') {
    await submitLog('Health', `Garmin connected successfully`);
    await pool.query(
      `INSERT INTO garmin_credentials (user_id, email_encrypted, oauth1_token_encrypted, mfa_pending)
       VALUES ($1, $2, $3, false)
       ON CONFLICT (user_id) DO UPDATE SET
         email_encrypted = EXCLUDED.email_encrypted,
         oauth1_token_encrypted = EXCLUDED.oauth1_token_encrypted,
         mfa_pending = false,
         updated_at = NOW()`,
      [userId, encrypt(email), encrypt(result.session_dump)]
    );
    await upsertConnection(userId, GARMIN_PROVIDER, { isConnected: true, dataMode: dataModeForUpsert, lastError: null });

    return { is_connected: true, mfa_pending: false };
  }

  throw new Error(`Unexpected response from worker: ${result.status}`);
}

// ─── MFA ───────────────────────────────────────────────────────────────────────

export async function submitGarminMfa(mfaCode: string) {
  const userId = await getSessionUserId();
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
       mfa_pending = false,
       updated_at = NOW()
     WHERE user_id = $1`,
    [userId, encrypt(result.session_dump)]
  );
  await upsertConnection(userId, GARMIN_PROVIDER, { isConnected: true, lastError: null });

  await pool.query('DELETE FROM health_mfa_sessions WHERE user_id = $1', [userId]);

  return { is_connected: true, mfa_pending: false };
}

// ─── Disconnect ────────────────────────────────────────────────────────────────

export async function disconnectGarmin() {
  const userId = await getSessionUserId();
  await pool.query('DELETE FROM garmin_credentials WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM health_mfa_sessions WHERE user_id = $1', [userId]);
  await clearConnection(userId, GARMIN_PROVIDER);
  return { success: true };
}

// ─── Sync ──────────────────────────────────────────────────────────────────────

export async function triggerHealthSync(days = 2) {
  const userId = await getSessionUserId();
  return _runSync(userId, 'manual', days);
}

export async function triggerInitialSync() {
  const userId = await getSessionUserId();
  return _runSync(userId, 'full', 30);
}

async function _runSync(userId: string, jobType: 'manual' | 'full', days: number) {
  await submitLog('Health', '_runSync called');
  const connection = await getGarminConnection(userId);
  if (!connection) {
    throw new Error('Garmin not connected');
  }
  if (connection.isProxy) {
    throw new Error('Sync is disabled for this connection — it is set to live/proxy mode, where nothing is cached.');
  }

  const sessionDump = connection.sessionDump;
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
    const retriedCorrections = await _retryGarminExerciseCorrections(userId, sessionDump);

    await submitLog(
      'Health',
      `Sync complete: ${data.metrics.length} days + ${allActivities.length} activities synced`
      + `; ${retriedCorrections} exercise correction(s) retried`,
    );

    await pool.query(
      `UPDATE health_sync_jobs SET status='completed', completed_at=NOW(), records_fetched=$2 WHERE id=$1`,
      [jobId, data.metrics.length + allActivities.length]
    );
    await upsertConnection(userId, GARMIN_PROVIDER, { lastSyncAt: new Date(), lastError: null });

    return { success: true, records: data.metrics.length + allActivities.length };
  } catch (e: any) {
    await submitLog('Health', `Sync failed: ${e.message}`);
    await pool.query(
      `UPDATE health_sync_jobs SET status='failed', completed_at=NOW(), error_message=$2 WHERE id=$1`,
      [jobId, e.message]
    );
    await upsertConnection(userId, GARMIN_PROVIDER, { lastError: e.message });
    throw e;
  }
}

// ─── Metrics queries ───────────────────────────────────────────────────────────

export async function getHealthMetrics(startDate: string, endDate: string) {
  const userId = await getSessionUserId();
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

  // If no data in database for this range, fetch from API — but only for
  // cached-mode connections. Proxy-mode connections are never browsed from
  // Allerac's own dashboard at all (see HealthDashboard.tsx); this function
  // simply has nothing to return for them, by design.
  if (metrics.length === 0) {
    const connection = await getGarminConnection(userId);
    if (connection && !connection.isProxy) {
      await submitLog('Health', `No metrics in database for ${startDate} to ${endDate}, fetching from API`);
      try {
        const syncRes = await workerFetch('POST', '/sync', {
          session_dump: connection.sessionDump,
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

export async function getHealthSummary(period: 'day' | '3days' | 'week' | 'month' | 'year') {
  const userId = await getSessionUserId();
  const connection = await getGarminConnection(userId);
  if (connection?.isProxy) {
    // Trends require history, and proxy-mode connections never accumulate
    // any — nothing to aggregate.
    return { period, unavailable: true, reason: 'proxy_mode' as const };
  }
  const summary = await queryHealthSummary(userId, period);
  return { period, ...summary };
}

export async function getDailySnapshot(date: string) {
  const userId = await getSessionUserId();
  return getDailySnapshotForUser(userId, date);
}

async function getDailySnapshotForUser(userId: string, date: string) {
  return queryDailyMetricsSnapshot(userId, date);
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
    const rawData = applyActivityCorrection(row);
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

export async function getDailyHealth(date: string) {
  const userId = await getSessionUserId();
  await submitLog('Health', `Fetching daily health for ${date}`);

  // Try cache first
  const cached = await getDailySnapshotForUser(userId, date);
  if (cached) {
    await submitLog('Health', `Daily health from cache for ${date}`);
    return cached;
  }

  // Fetch from API — cached-mode connections only. Proxy-mode connections
  // are never browsed from Allerac's own dashboard (see HealthDashboard.tsx);
  // there is nothing to return here for them, by design.
  const connection = await getGarminConnection(userId);
  if (!connection) {
    throw new Error('Garmin not connected');
  }
  if (connection.isProxy) {
    return null;
  }

  const data = await workerFetch('POST', '/daily-health', {
    session_dump: connection.sessionDump,
    date,
  });

  // Save to database
  await _upsertMetrics(userId, [{ date, ...data }]);
  await submitLog('Health', `Daily health retrieved and saved: ${Object.keys(data).length} fields`);
  return data;
}

export async function getActivitiesRange(startDate: string, endDate: string) {
  const userId = await getSessionUserId();
  await submitLog('Health', `Fetching activities from ${startDate} to ${endDate}`);

  // Try to get from database first
  const cachedActivities = await getActivitiesFromDB(userId, startDate, endDate);
  if (cachedActivities.length > 0) {
    await submitLog('Health', `Activities from cache: ${cachedActivities.length} activities`);
    return { activities: cachedActivities };
  }

  const connection = await getGarminConnection(userId);
  if (!connection) {
    throw new Error('Garmin not connected');
  }
  // Proxy-mode connections are never browsed from Allerac's own dashboard
  // (see HealthDashboard.tsx) — nothing to return here for them.
  if (connection.isProxy) {
    return { activities: [] };
  }

  // Fetch activities for each day in range
  const allActivities: any[] = [];
  const current = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    try {
      const data = await workerFetch('POST', '/activities', {
        session_dump: connection.sessionDump,
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

export async function getRecentActivities(limit: number = 10, filterDate?: string) {
  const userId = await getSessionUserId();
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

  const connection = await getGarminConnection(userId);
  if (!connection) {
    throw new Error('Garmin not connected');
  }
  // Proxy-mode connections are never browsed from Allerac's own dashboard
  // (see HealthDashboard.tsx) — nothing to return here for them.
  if (connection.isProxy) {
    return [];
  }

  await submitLog('Health', `Calling worker /activities endpoint${filterDate ? ` for ${filterDate}` : ''}...`);
  const data = await workerFetch('POST', '/activities', {
    session_dump: connection.sessionDump,
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

export async function getActivitiesInRange(startDate: string, endDate: string, limit: number = 50) {
  const userId = await getSessionUserId();
  const cached = await getActivitiesFromDB(userId, startDate, endDate);
  return cached.slice(0, limit);
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

async function _retryGarminExerciseCorrections(userId: string, sessionDump: string): Promise<number> {
  const pending = await pool.query(
    `SELECT activity_id, corrected_exercise_sets
     FROM health_activities
     WHERE user_id = $1
       AND garmin_sync_status IN ('pending', 'garmin_sync_failed')
       AND garmin_sync_attempts < 3
     ORDER BY correction_updated_at ASC
     LIMIT 10`,
    [userId],
  );

  for (const row of pending.rows) {
    try {
      await workerFetch('PUT', '/activities/exercise-sets', {
        session_dump: sessionDump,
        activity_id: row.activity_id,
        exercise_sets: row.corrected_exercise_sets,
      });
      await pool.query(
        `UPDATE health_activities
         SET garmin_sync_status = 'synced',
             garmin_sync_error = NULL,
             garmin_sync_attempts = garmin_sync_attempts + 1,
             updated_at = NOW()
         WHERE user_id = $1 AND activity_id = $2`,
        [userId, row.activity_id],
      );
    } catch (error: any) {
      await pool.query(
        `UPDATE health_activities
         SET garmin_sync_error = $3,
             garmin_sync_attempts = garmin_sync_attempts + 1,
             updated_at = NOW()
         WHERE user_id = $1 AND activity_id = $2`,
        [userId, row.activity_id, String(error?.message ?? error).slice(0, 2000)],
      );
    }
  }
  return pending.rows.length;
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
