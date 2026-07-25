import pool from '@/app/clients/db';
import { encrypt, safeDecrypt } from '@/app/services/crypto/encryption.service';
import {
  SpotifyApiService,
  SpotifyProfile,
  SpotifyTokenResponse,
} from './spotify-api.service';

const REFRESH_THRESHOLD_MS = 10 * 60 * 1000;

export interface SpotifyStatus {
  configured: boolean;
  is_connected: boolean;
  display_name: string | null;
  avatar_url: string | null;
  scopes: string | null;
  access_expires_at: Date | null;
  last_sync_at: Date | null;
  last_error: string | null;
}

interface CredentialRow {
  user_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  access_expires_at: Date | string | null;
  is_connected: boolean;
}

function expiryDate(seconds: number): Date {
  return new Date(Date.now() + Math.max(0, seconds) * 1000);
}

function needsRefresh(expiresAt: Date | string | null): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() <= Date.now() + REFRESH_THRESHOLD_MS;
}

export class SpotifyCredentialsService {
  constructor(private readonly api = new SpotifyApiService()) {}

  async getStatus(userId: string): Promise<SpotifyStatus> {
    const result = await pool.query(
      `SELECT display_name, avatar_url, scopes, access_expires_at, last_sync_at, is_connected, last_error
       FROM spotify_credentials
       WHERE user_id = $1`,
      [userId],
    );
    const row = result.rows[0];
    return {
      configured: this.api.isConfigured(),
      is_connected: Boolean(row?.is_connected),
      display_name: row?.display_name ?? null,
      avatar_url: row?.avatar_url ?? null,
      scopes: row?.scopes ?? null,
      access_expires_at: row?.access_expires_at ?? null,
      last_sync_at: row?.last_sync_at ?? null,
      last_error: row?.last_error ?? null,
    };
  }

  async saveTokens(
    userId: string,
    tokens: SpotifyTokenResponse,
    profile: SpotifyProfile,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO spotify_credentials (
         user_id, spotify_user_id, display_name, avatar_url,
         access_token_encrypted, refresh_token_encrypted, token_type,
         access_expires_at, scopes,
         is_connected, last_error
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NULL)
       ON CONFLICT (user_id) DO UPDATE SET
         spotify_user_id = EXCLUDED.spotify_user_id,
         display_name = EXCLUDED.display_name,
         avatar_url = EXCLUDED.avatar_url,
         access_token_encrypted = EXCLUDED.access_token_encrypted,
         refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
         token_type = EXCLUDED.token_type,
         access_expires_at = EXCLUDED.access_expires_at,
         scopes = EXCLUDED.scopes,
         is_connected = true,
         last_error = NULL,
         updated_at = NOW()`,
      [
        userId,
        profile.spotifyUserId,
        profile.displayName,
        profile.avatarUrl,
        encrypt(tokens.access_token),
        encrypt(tokens.refresh_token),
        tokens.token_type || 'Bearer',
        expiryDate(tokens.expires_in),
        tokens.scope,
      ],
    );
  }

  async getValidAccessToken(userId: string): Promise<string | null> {
    const initial = await pool.query<CredentialRow>(
      `SELECT user_id, access_token_encrypted, refresh_token_encrypted, access_expires_at, is_connected
       FROM spotify_credentials
       WHERE user_id = $1 AND is_connected = true`,
      [userId],
    );
    const row = initial.rows[0];
    if (!row?.access_token_encrypted) return null;
    if (!needsRefresh(row.access_expires_at)) {
      return safeDecrypt(row.access_token_encrypted);
    }
    return this.refreshWithLock(userId);
  }

  async disconnect(userId: string): Promise<void> {
    // Spotify's Web API has no token-revoke endpoint — clearing local tokens is enough.
    await pool.query(
      `UPDATE spotify_credentials
       SET is_connected = false,
           access_token_encrypted = '',
           refresh_token_encrypted = '',
           access_expires_at = NULL,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId],
    );
  }

  async setError(userId: string, errorCode: string): Promise<void> {
    await pool.query(
      `INSERT INTO spotify_credentials (user_id, is_connected, last_error)
       VALUES ($1, false, $2)
       ON CONFLICT (user_id) DO UPDATE SET
         last_error = $2,
         updated_at = NOW()`,
      [userId, errorCode.slice(0, 200)],
    );
  }

  async markSynced(userId: string): Promise<void> {
    await pool.query(
      `UPDATE spotify_credentials SET last_sync_at = NOW(), last_error = NULL, updated_at = NOW() WHERE user_id = $1`,
      [userId],
    );
  }

  private async refreshWithLock(userId: string): Promise<string | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query<CredentialRow>(
        `SELECT user_id, access_token_encrypted, refresh_token_encrypted, access_expires_at, is_connected
         FROM spotify_credentials
         WHERE user_id = $1 AND is_connected = true
         FOR UPDATE`,
        [userId],
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
      if (!row.refresh_token_encrypted) {
        await client.query(
          `UPDATE spotify_credentials
           SET is_connected = false, last_error = 'spotify_refresh_missing', updated_at = NOW()
           WHERE user_id = $1`,
          [userId],
        );
        await client.query('COMMIT');
        return null;
      }

      const refreshed = await this.api.refreshAccessToken(safeDecrypt(row.refresh_token_encrypted));
      await client.query(
        `UPDATE spotify_credentials
         SET access_token_encrypted = $2,
             refresh_token_encrypted = $3,
             token_type = $4,
             access_expires_at = $5,
             scopes = $6,
             last_error = NULL,
             updated_at = NOW()
         WHERE user_id = $1`,
        [
          userId,
          encrypt(refreshed.access_token),
          encrypt(refreshed.refresh_token),
          refreshed.token_type || 'Bearer',
          expiryDate(refreshed.expires_in),
          refreshed.scope,
        ],
      );
      await client.query('COMMIT');
      return refreshed.access_token;
    } catch (error) {
      await client.query('ROLLBACK');
      await pool.query(
        `UPDATE spotify_credentials
         SET last_error = 'spotify_refresh_failed', updated_at = NOW()
         WHERE user_id = $1`,
        [userId],
      );
      throw error;
    } finally {
      client.release();
    }
  }
}
