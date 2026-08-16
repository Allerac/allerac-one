// Garmin "proxy mode" — live reads through the health-worker that are never
// written to health_activities / health_daily_metrics and never logged with
// payload content. See docs/architecture/allerac-bridge.md (Garmin proof of
// concept, proxy data mode). Used only by /api/v1/health/proxy/* routes.

import pool from '@/app/clients/db';
import { safeDecrypt } from '@/app/services/crypto/encryption.service';
import { getConnection } from '@/app/services/integrations/integration-connections.service';
import { callHealthWorker } from '@/app/services/health/health-query.service';

export class GarminNotConnectedError extends Error {
  constructor() {
    super('Garmin is not connected for this user');
    this.name = 'GarminNotConnectedError';
  }
}

export async function requireGarminSessionDump(userId: string): Promise<string> {
  const connection = await getConnection(userId, 'garmin');
  if (!connection?.isConnected) {
    throw new GarminNotConnectedError();
  }
  const res = await pool.query(
    'SELECT oauth1_token_encrypted FROM garmin_credentials WHERE user_id = $1',
    [userId],
  );
  if (res.rows.length === 0) {
    throw new GarminNotConnectedError();
  }
  return safeDecrypt(res.rows[0].oauth1_token_encrypted);
}

// Shared by every /proxy/activities/{activityId}/* route (detail, laps,
// zones, route, series) — each is a fresh, independent live call to the
// health-worker's single /activity-details fetch (proxy mode never caches
// or shares results between requests, same as every other proxy endpoint).
// Callers slice out the piece of this raw payload their contract promises.
export async function fetchProxyActivityDetails(userId: string, activityId: string): Promise<Record<string, unknown>> {
  const sessionDump = await requireGarminSessionDump(userId);
  return callHealthWorker('POST', '/activity-details', {
    session_dump: sessionDump,
    activity_id: activityId,
  });
}
