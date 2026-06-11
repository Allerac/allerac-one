import pool from '@/app/clients/db';
import { encrypt, safeDecrypt } from '@/app/services/crypto/encryption.service';
import {
  TikTokApiService,
  TikTokProfile,
  TikTokTokenResponse,
} from './tiktok-api.service';

const REFRESH_THRESHOLD_MS = 10 * 60 * 1000;

export interface TikTokStatus {
  configured: boolean;
  is_connected: boolean;
  is_assigned: boolean;
  display_name: string | null;
  avatar_url: string | null;
  scopes: string | null;
  access_expires_at: Date | null;
  last_error: string | null;
}

interface CredentialRow {
  user_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  access_expires_at: Date | string | null;
  refresh_expires_at: Date | string | null;
  is_connected: boolean;
}

function expiryDate(seconds: number): Date {
  return new Date(Date.now() + Math.max(0, seconds) * 1000);
}

function needsRefresh(expiresAt: Date | string | null): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() <= Date.now() + REFRESH_THRESHOLD_MS;
}

export class TikTokCredentialsService {
  constructor(private readonly api = new TikTokApiService()) {}

  async getStatus(userId: string): Promise<TikTokStatus> {
    const result = await pool.query(
      `SELECT
         tc.display_name,
         tc.avatar_url,
         tc.scopes,
         tc.access_expires_at,
         tc.is_connected,
         tc.last_error,
         (owner.user_id <> $1) AS is_assigned
       FROM (
         SELECT COALESCE(ta.owner_user_id, $1::uuid) AS user_id
         FROM (SELECT 1) seed
         LEFT JOIN user_tiktok_account uta ON uta.user_id = $1
         LEFT JOIN tiktok_accounts ta ON ta.id = uta.tiktok_account_id
       ) owner
       LEFT JOIN tiktok_credentials tc ON tc.user_id = owner.user_id`,
      [userId],
    );
    const row = result.rows[0];
    return {
      configured: this.api.isConfigured(),
      is_connected: Boolean(row?.is_connected),
      is_assigned: Boolean(row?.is_assigned),
      display_name: row?.display_name ?? null,
      avatar_url: row?.avatar_url ?? null,
      scopes: row?.scopes ?? null,
      access_expires_at: row?.access_expires_at ?? null,
      last_error: row?.last_error ?? null,
    };
  }

  async saveTokens(
    userId: string,
    tokens: TikTokTokenResponse,
    profile: TikTokProfile,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO tiktok_credentials (
         user_id, open_id, display_name, avatar_url,
         access_token_encrypted, refresh_token_encrypted, token_type,
         access_expires_at, refresh_expires_at, scopes,
         is_connected, last_refresh_at, last_error
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW(), NULL)
       ON CONFLICT (user_id) DO UPDATE SET
         open_id = EXCLUDED.open_id,
         display_name = EXCLUDED.display_name,
         avatar_url = EXCLUDED.avatar_url,
         access_token_encrypted = EXCLUDED.access_token_encrypted,
         refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
         token_type = EXCLUDED.token_type,
         access_expires_at = EXCLUDED.access_expires_at,
         refresh_expires_at = EXCLUDED.refresh_expires_at,
         scopes = EXCLUDED.scopes,
         is_connected = true,
         last_refresh_at = NOW(),
         last_error = NULL,
         updated_at = NOW()`,
      [
        userId,
        profile.openId,
        profile.displayName,
        profile.avatarUrl,
        encrypt(tokens.access_token),
        encrypt(tokens.refresh_token),
        tokens.token_type || 'Bearer',
        expiryDate(tokens.expires_in),
        expiryDate(tokens.refresh_expires_in),
        tokens.scope,
      ],
    );
  }

  async resolveCredentialsUserId(userId: string): Promise<string> {
    const result = await pool.query(
      `SELECT ta.owner_user_id
       FROM user_tiktok_account uta
       JOIN tiktok_accounts ta ON ta.id = uta.tiktok_account_id
       WHERE uta.user_id = $1`,
      [userId],
    );
    return result.rows[0]?.owner_user_id ?? userId;
  }

  async getValidAccessToken(userId: string): Promise<string | null> {
    const ownerUserId = await this.resolveCredentialsUserId(userId);
    const initial = await pool.query<CredentialRow>(
      `SELECT user_id, access_token_encrypted, refresh_token_encrypted,
              access_expires_at, refresh_expires_at, is_connected
       FROM tiktok_credentials
       WHERE user_id = $1 AND is_connected = true`,
      [ownerUserId],
    );
    const row = initial.rows[0];
    if (!row?.access_token_encrypted) return null;
    if (!needsRefresh(row.access_expires_at)) {
      return safeDecrypt(row.access_token_encrypted);
    }
    return this.refreshWithLock(ownerUserId);
  }

  async disconnect(userId: string): Promise<void> {
    const result = await pool.query<Pick<CredentialRow, 'access_token_encrypted'>>(
      `SELECT access_token_encrypted
       FROM tiktok_credentials
       WHERE user_id = $1 AND is_connected = true`,
      [userId],
    );
    const encryptedToken = result.rows[0]?.access_token_encrypted;
    if (encryptedToken) {
      try {
        await this.api.revokeAccess(safeDecrypt(encryptedToken));
      } catch {
        console.warn('[TikTok] Token revoke failed; local credentials will still be removed');
      }
    }
    await pool.query(
      `UPDATE tiktok_credentials
       SET is_connected = false,
           access_token_encrypted = '',
           refresh_token_encrypted = '',
           access_expires_at = NULL,
           refresh_expires_at = NULL,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId],
    );
  }

  async setError(userId: string, errorCode: string): Promise<void> {
    await pool.query(
      `INSERT INTO tiktok_credentials (user_id, is_connected, last_error)
       VALUES ($1, false, $2)
       ON CONFLICT (user_id) DO UPDATE SET
         last_error = $2,
         updated_at = NOW()`,
      [userId, errorCode.slice(0, 200)],
    );
  }

  private async refreshWithLock(ownerUserId: string): Promise<string | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query<CredentialRow>(
        `SELECT user_id, access_token_encrypted, refresh_token_encrypted,
                access_expires_at, refresh_expires_at, is_connected
         FROM tiktok_credentials
         WHERE user_id = $1 AND is_connected = true
         FOR UPDATE`,
        [ownerUserId],
      );
      const row = locked.rows[0];
      if (!row?.access_token_encrypted) {
        await client.query('COMMIT');
        return null;
      }
      if (!needsRefresh(row.access_expires_at)) {
        await client.query('COMMIT');
        return safeDecrypt(row.access_token_encrypted);
      }
      if (!row.refresh_token_encrypted || (
        row.refresh_expires_at &&
        new Date(row.refresh_expires_at).getTime() <= Date.now()
      )) {
        await client.query(
          `UPDATE tiktok_credentials
           SET is_connected = false, last_error = 'tiktok_refresh_expired', updated_at = NOW()
           WHERE user_id = $1`,
          [ownerUserId],
        );
        await client.query('COMMIT');
        return null;
      }

      const refreshed = await this.api.refreshAccessToken(
        safeDecrypt(row.refresh_token_encrypted),
      );
      await client.query(
        `UPDATE tiktok_credentials
         SET open_id = $2,
             access_token_encrypted = $3,
             refresh_token_encrypted = $4,
             token_type = $5,
             access_expires_at = $6,
             refresh_expires_at = $7,
             scopes = $8,
             last_refresh_at = NOW(),
             last_error = NULL,
             updated_at = NOW()
         WHERE user_id = $1`,
        [
          ownerUserId,
          refreshed.open_id,
          encrypt(refreshed.access_token),
          encrypt(refreshed.refresh_token),
          refreshed.token_type || 'Bearer',
          expiryDate(refreshed.expires_in),
          expiryDate(refreshed.refresh_expires_in),
          refreshed.scope,
        ],
      );
      await client.query('COMMIT');
      return refreshed.access_token;
    } catch (error) {
      await client.query('ROLLBACK');
      await pool.query(
        `UPDATE tiktok_credentials
         SET last_error = 'tiktok_refresh_failed', updated_at = NOW()
         WHERE user_id = $1`,
        [ownerUserId],
      );
      throw error;
    } finally {
      client.release();
    }
  }
}
