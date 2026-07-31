// Garmin "proxy mode" — live reads through the health-worker that are never
// written to health_activities / health_daily_metrics and never logged with
// payload content. See docs/architecture/allerac-bridge.md (Garmin proof of
// concept, proxy data mode). Used only by /api/v1/health/proxy/* routes.

import pool from '@/app/clients/db';
import { safeDecrypt } from '@/app/services/crypto/encryption.service';

export class GarminNotConnectedError extends Error {
  constructor() {
    super('Garmin is not connected for this user');
    this.name = 'GarminNotConnectedError';
  }
}

export async function requireGarminSessionDump(userId: string): Promise<string> {
  const res = await pool.query(
    'SELECT oauth1_token_encrypted, is_connected FROM garmin_credentials WHERE user_id = $1',
    [userId],
  );
  if (res.rows.length === 0 || !res.rows[0].is_connected) {
    throw new GarminNotConnectedError();
  }
  return safeDecrypt(res.rows[0].oauth1_token_encrypted);
}
