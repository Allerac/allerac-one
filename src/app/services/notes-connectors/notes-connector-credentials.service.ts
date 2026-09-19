import pool from '@/app/clients/db';
import { encrypt, safeDecrypt } from '@/app/services/crypto/encryption.service';
import type { NotesConnectorProvider, NotesConnectorTokens } from './types';

const REFRESH_MARGIN_SECONDS = 10 * 60;

interface CredentialRow {
  id: string;
  user_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  access_token_expires_at: Date | string | null;
}

export interface NotesConnectorConnection {
  credentialId: string;
  accountId: string | null;
  accountLabel: string | null;
  scopes: string | null;
  status: 'active' | 'revoked' | 'error';
  lastSyncAt: string | Date | null;
  lastError: string | null;
}

/**
 * Generic, provider-parameterized credential store for Notes connectors.
 *
 * Supports multiple simultaneous accounts per (user, provider) — e.g.
 * personal + work Google Drive — so status/secrets both live directly on
 * notes_connector_credentials (one row per account), not in the shared
 * integration_connections table used by Garmin/Strava/Spotify, which only
 * models one connection per (user, provider). See
 * docs/roadmap/notes-external-connectors.md and migration 133.
 */
export class NotesConnectorCredentialsService {
  constructor(
    private readonly provider: NotesConnectorProvider,
    readonly isConfigured: () => boolean,
    private readonly refreshTokenFn: (refreshToken: string) => Promise<NotesConnectorTokens>,
  ) {}

  async listConnections(userId: string): Promise<NotesConnectorConnection[]> {
    const result = await pool.query<{
      id: string;
      provider_account_id: string | null;
      provider_account_label: string | null;
      granted_scopes: string | null;
      status: 'active' | 'revoked' | 'error';
      last_synced_at: string | Date | null;
      last_error: string | null;
    }>(
      `SELECT id, provider_account_id, provider_account_label, granted_scopes, status, last_synced_at, last_error
       FROM notes_connector_credentials
       WHERE user_id = $1 AND provider = $2 AND status != 'revoked'
       ORDER BY created_at ASC`,
      [userId, this.provider],
    );
    return result.rows.map(row => ({
      credentialId: row.id,
      accountId: row.provider_account_id,
      accountLabel: row.provider_account_label,
      scopes: row.granted_scopes,
      status: row.status,
      lastSyncAt: row.last_synced_at,
      lastError: row.last_error,
    }));
  }

  /** Upserts by (user, provider, account) — connecting a new account adds a row; reconnecting the same account updates it in place. */
  async save(userId: string, tokens: NotesConnectorTokens): Promise<{ credentialId: string }> {
    if (!tokens.accessToken || !tokens.refreshToken) {
      throw new Error(`${this.provider} token exchange returned incomplete credentials`);
    }
    const result = await pool.query<{ id: string }>(
      `INSERT INTO notes_connector_credentials (
         user_id, provider, provider_account_id, provider_account_label,
         access_token_encrypted, refresh_token_encrypted, access_token_expires_at, granted_scopes, status, last_error
       ) VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7),$8,'active',NULL)
       ON CONFLICT (user_id, provider, provider_account_id) DO UPDATE SET
         provider_account_label=EXCLUDED.provider_account_label,
         access_token_encrypted=EXCLUDED.access_token_encrypted,
         refresh_token_encrypted=EXCLUDED.refresh_token_encrypted,
         access_token_expires_at=EXCLUDED.access_token_expires_at,
         granted_scopes=EXCLUDED.granted_scopes,
         status='active',
         last_error=NULL,
         updated_at=NOW()
       RETURNING id`,
      [
        userId, this.provider, tokens.accountId ?? null, tokens.accountLabel ?? null,
        encrypt(tokens.accessToken), encrypt(tokens.refreshToken), tokens.expiresAt, tokens.scopes ?? null,
      ],
    );
    return { credentialId: result.rows[0].id };
  }

  /** Verifies credentialId belongs to userId and this provider, then returns a valid access token, refreshing if needed. */
  async getValidAccessToken(userId: string, credentialId: string): Promise<{ accessToken: string } | null> {
    const result = await pool.query<CredentialRow>(
      `SELECT id, user_id, access_token_encrypted, refresh_token_encrypted, access_token_expires_at
       FROM notes_connector_credentials WHERE id = $1 AND user_id = $2 AND provider = $3`,
      [credentialId, userId, this.provider],
    );
    const row = result.rows[0];
    if (!row?.access_token_encrypted) return null;

    const expiresAt = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() / 1000 : 0;
    if (expiresAt > Date.now() / 1000 + REFRESH_MARGIN_SECONDS) {
      return { accessToken: safeDecrypt(row.access_token_encrypted) };
    }

    try {
      const refreshed = await this.refreshTokenFn(safeDecrypt(row.refresh_token_encrypted));
      await pool.query(
        `UPDATE notes_connector_credentials
         SET access_token_encrypted=$2, refresh_token_encrypted=$3, access_token_expires_at=to_timestamp($4), updated_at=NOW()
         WHERE id=$1`,
        [row.id, encrypt(refreshed.accessToken), encrypt(refreshed.refreshToken), refreshed.expiresAt],
      );
      return { accessToken: refreshed.accessToken };
    } catch (error) {
      await pool.query(
        `UPDATE notes_connector_credentials SET status='error', last_error=$2, updated_at=NOW() WHERE id=$1`,
        [row.id, error instanceof Error ? error.message : 'Token refresh failed'],
      );
      return null;
    }
  }

  async recordSyncResult(credentialId: string, error: string | null): Promise<void> {
    await pool.query(
      `UPDATE notes_connector_credentials SET last_synced_at=NOW(), last_error=$2, status=CASE WHEN $2 IS NULL THEN 'active' ELSE status END, updated_at=NOW() WHERE id=$1`,
      [credentialId, error],
    );
  }

  async disconnect(userId: string, credentialId: string): Promise<void> {
    await pool.query(
      `UPDATE notes_connector_credentials
       SET status='revoked', access_token_encrypted='', refresh_token_encrypted='', access_token_expires_at=NULL, updated_at=NOW()
       WHERE id=$1 AND user_id=$2 AND provider=$3`,
      [credentialId, userId, this.provider],
    );
  }
}
