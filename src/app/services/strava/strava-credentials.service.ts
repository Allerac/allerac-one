import pool from '@/app/clients/db';
import { encrypt, safeDecrypt } from '@/app/services/crypto/encryption.service';
import { getConnection, upsertConnection } from '@/app/services/integrations/integration-connections.service';
import { StravaApiService, StravaAthlete, StravaTokenResponse } from './strava-api.service';

const REFRESH_MARGIN_SECONDS = 10 * 60;

interface CredentialRow {
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  access_expires_at: Date | string | null;
}

export class StravaCredentialsService {
  constructor(private readonly api = new StravaApiService()) {}

  async getStatus(userId: string) {
    const [credential, connection] = await Promise.all([
      pool.query(`SELECT athlete_id, athlete_name, avatar_url, access_expires_at, scopes
                  FROM strava_credentials WHERE user_id = $1`, [userId]),
      getConnection(userId, 'strava'),
    ]);
    const row = credential.rows[0];
    return {
      configured: this.api.isConfigured(),
      is_connected: Boolean(connection?.isConnected && row),
      athlete_id: row?.athlete_id ?? null,
      athlete_name: row?.athlete_name ?? null,
      avatar_url: row?.avatar_url ?? null,
      scopes: row?.scopes ?? null,
      access_expires_at: row?.access_expires_at ?? null,
      last_sync_at: connection?.lastSyncAt ?? null,
      last_error: connection?.lastError ?? null,
    };
  }

  async save(userId: string, tokens: StravaTokenResponse, athlete?: StravaAthlete, scopes = 'read,activity:read_all') {
    if (!tokens.access_token || !tokens.refresh_token || !athlete?.id) {
      throw new Error('Strava token exchange returned incomplete credentials');
    }
    const athleteName = [athlete.firstname, athlete.lastname].filter(Boolean).join(' ').trim() || `Athlete ${athlete.id}`;
    await pool.query(
      `INSERT INTO strava_credentials (
         user_id, athlete_id, athlete_name, avatar_url, access_token_encrypted,
         refresh_token_encrypted, access_expires_at, scopes
       ) VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7),$8)
       ON CONFLICT (user_id) DO UPDATE SET
         athlete_id=EXCLUDED.athlete_id, athlete_name=EXCLUDED.athlete_name,
         avatar_url=EXCLUDED.avatar_url, access_token_encrypted=EXCLUDED.access_token_encrypted,
         refresh_token_encrypted=EXCLUDED.refresh_token_encrypted,
         access_expires_at=EXCLUDED.access_expires_at, scopes=EXCLUDED.scopes, updated_at=NOW()`,
      [userId, athlete.id, athleteName, athlete.profile ?? null, encrypt(tokens.access_token),
       encrypt(tokens.refresh_token), tokens.expires_at, scopes],
    );
    await upsertConnection(userId, 'strava', { isConnected: true, dataMode: 'cached', syncEnabled: true, lastError: null });
  }

  async getValidAccessToken(userId: string): Promise<string | null> {
    const result = await pool.query<CredentialRow>(
      `SELECT access_token_encrypted, refresh_token_encrypted, access_expires_at
       FROM strava_credentials WHERE user_id = $1`, [userId],
    );
    const row = result.rows[0];
    if (!row?.access_token_encrypted) return null;
    const expiresAt = row.access_expires_at ? new Date(row.access_expires_at).getTime() / 1000 : 0;
    if (expiresAt > Date.now() / 1000 + REFRESH_MARGIN_SECONDS) return safeDecrypt(row.access_token_encrypted);
    const refreshed = await this.api.refreshToken(safeDecrypt(row.refresh_token_encrypted));
    await pool.query(
      `UPDATE strava_credentials SET access_token_encrypted=$2, refresh_token_encrypted=$3,
       access_expires_at=to_timestamp($4), updated_at=NOW() WHERE user_id=$1`,
      [userId, encrypt(refreshed.access_token), encrypt(refreshed.refresh_token), refreshed.expires_at],
    );
    return refreshed.access_token;
  }

  async disconnect(userId: string) {
    await pool.query(
      `UPDATE strava_credentials SET access_token_encrypted='', refresh_token_encrypted='',
       access_expires_at=NULL, updated_at=NOW() WHERE user_id=$1`, [userId],
    );
    await upsertConnection(userId, 'strava', { isConnected: false, syncEnabled: false, lastError: null });
  }
}
