import pool from '@/app/clients/db';
import { encrypt, safeDecrypt } from '@/app/services/crypto/encryption.service';
import { getConnection, upsertConnection } from '@/app/services/integrations/integration-connections.service';
import type { NotesConnectorProvider, NotesConnectorTokens } from './types';

const REFRESH_MARGIN_SECONDS = 10 * 60;

interface CredentialRow {
  id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  access_token_expires_at: Date | string | null;
}

export interface NotesConnectorStatus {
  configured: boolean;
  isConnected: boolean;
  accountId: string | null;
  accountLabel: string | null;
  scopes: string | null;
  lastSyncAt: string | Date | null;
  lastError: string | null;
}

/**
 * Generic, provider-parameterized credential store for Notes connectors.
 * Connection status (is_connected/last_sync_at/last_error) lives in the
 * shared integration_connections table; this service owns only the
 * encrypted secrets in notes_connector_credentials.
 */
export class NotesConnectorCredentialsService {
  constructor(
    private readonly provider: NotesConnectorProvider,
    private readonly isConfigured: () => boolean,
    private readonly refreshToken: (refreshToken: string) => Promise<NotesConnectorTokens>,
  ) {}

  async getStatus(userId: string): Promise<NotesConnectorStatus> {
    const [credential, connection] = await Promise.all([
      pool.query<{ provider_account_id: string | null; provider_account_label: string | null; granted_scopes: string | null }>(
        `SELECT provider_account_id, provider_account_label, granted_scopes
         FROM notes_connector_credentials WHERE user_id = $1 AND provider = $2`,
        [userId, this.provider],
      ),
      getConnection(userId, this.provider),
    ]);
    const row = credential.rows[0];
    return {
      configured: this.isConfigured(),
      isConnected: Boolean(connection?.isConnected && row),
      accountId: row?.provider_account_id ?? null,
      accountLabel: row?.provider_account_label ?? null,
      scopes: row?.granted_scopes ?? null,
      lastSyncAt: connection?.lastSyncAt ?? null,
      lastError: connection?.lastError ?? null,
    };
  }

  async save(userId: string, tokens: NotesConnectorTokens): Promise<void> {
    if (!tokens.accessToken || !tokens.refreshToken) {
      throw new Error(`${this.provider} token exchange returned incomplete credentials`);
    }
    await pool.query(
      `INSERT INTO notes_connector_credentials (
         user_id, provider, provider_account_id, provider_account_label,
         access_token_encrypted, refresh_token_encrypted, access_token_expires_at, granted_scopes
       ) VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7),$8)
       ON CONFLICT (user_id, provider) DO UPDATE SET
         provider_account_id=EXCLUDED.provider_account_id,
         provider_account_label=EXCLUDED.provider_account_label,
         access_token_encrypted=EXCLUDED.access_token_encrypted,
         refresh_token_encrypted=EXCLUDED.refresh_token_encrypted,
         access_token_expires_at=EXCLUDED.access_token_expires_at,
         granted_scopes=EXCLUDED.granted_scopes,
         updated_at=NOW()`,
      [
        userId, this.provider, tokens.accountId ?? null, tokens.accountLabel ?? null,
        encrypt(tokens.accessToken), encrypt(tokens.refreshToken), tokens.expiresAt, tokens.scopes ?? null,
      ],
    );
    await upsertConnection(userId, this.provider, { isConnected: true, dataMode: 'cached', syncEnabled: true, lastError: null });
  }

  async getCredentialId(userId: string): Promise<string | null> {
    const result = await pool.query<{ id: string }>(
      `SELECT id FROM notes_connector_credentials WHERE user_id = $1 AND provider = $2`,
      [userId, this.provider],
    );
    return result.rows[0]?.id ?? null;
  }

  /** Returns the credential row id (needed by notes_connector_items) plus a valid access token, refreshing if needed. */
  async getValidAccessToken(userId: string): Promise<{ credentialId: string; accessToken: string } | null> {
    const result = await pool.query<CredentialRow>(
      `SELECT id, access_token_encrypted, refresh_token_encrypted, access_token_expires_at
       FROM notes_connector_credentials WHERE user_id = $1 AND provider = $2`,
      [userId, this.provider],
    );
    const row = result.rows[0];
    if (!row?.access_token_encrypted) return null;

    const expiresAt = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() / 1000 : 0;
    if (expiresAt > Date.now() / 1000 + REFRESH_MARGIN_SECONDS) {
      return { credentialId: row.id, accessToken: safeDecrypt(row.access_token_encrypted) };
    }

    try {
      const refreshed = await this.refreshToken(safeDecrypt(row.refresh_token_encrypted));
      await pool.query(
        `UPDATE notes_connector_credentials
         SET access_token_encrypted=$2, refresh_token_encrypted=$3, access_token_expires_at=to_timestamp($4), updated_at=NOW()
         WHERE id=$1`,
        [row.id, encrypt(refreshed.accessToken), encrypt(refreshed.refreshToken), refreshed.expiresAt],
      );
      return { credentialId: row.id, accessToken: refreshed.accessToken };
    } catch (error) {
      await upsertConnection(userId, this.provider, {
        lastError: error instanceof Error ? error.message : 'Token refresh failed',
      });
      return null;
    }
  }

  async disconnect(userId: string): Promise<void> {
    await pool.query(
      `UPDATE notes_connector_credentials
       SET access_token_encrypted='', refresh_token_encrypted='', access_token_expires_at=NULL, updated_at=NOW()
       WHERE user_id=$1 AND provider=$2`,
      [userId, this.provider],
    );
    await upsertConnection(userId, this.provider, { isConnected: false, syncEnabled: false, lastError: null });
  }
}
