import pool from '@/app/clients/db';
import { encrypt, safeDecrypt } from '@/app/services/crypto/encryption.service';

export interface InstagramStatus {
  is_connected: boolean;
  ig_user_id: string | null;
  username: string | null;
  expires_at: Date | null;
  scopes: string | null;
  last_error: string | null;
}

export interface InstagramTokens {
  accessToken: string;
  igUserId: string;
  username: string;
  tokenType?: string;
  expiresAt?: Date | null;
  scopes?: string;
}

export class InstagramCredentialsService {
  async getStatus(userId: string): Promise<InstagramStatus> {
    const result = await pool.query(
      `SELECT ig_user_id, username, token_type, expires_at, scopes, is_connected, last_error
       FROM instagram_credentials WHERE user_id = $1`,
      [userId]
    );
    if (!result.rows[0]) {
      return { is_connected: false, ig_user_id: null, username: null, expires_at: null, scopes: null, last_error: null };
    }
    const row = result.rows[0];
    return {
      is_connected: row.is_connected,
      ig_user_id:   row.ig_user_id,
      username:     row.username,
      expires_at:   row.expires_at,
      scopes:       row.scopes,
      last_error:   row.last_error,
    };
  }

  async getAccessToken(userId: string): Promise<string | null> {
    const result = await pool.query(
      `SELECT access_token_encrypted FROM instagram_credentials WHERE user_id = $1 AND is_connected = true`,
      [userId]
    );
    if (!result.rows[0]?.access_token_encrypted) return null;
    return safeDecrypt(result.rows[0].access_token_encrypted);
  }

  async saveTokens(userId: string, tokens: InstagramTokens): Promise<void> {
    const encrypted = encrypt(tokens.accessToken);
    await pool.query(
      `INSERT INTO instagram_credentials
         (user_id, ig_user_id, username, access_token_encrypted, token_type, expires_at, scopes, is_connected, last_error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, NULL)
       ON CONFLICT (user_id) DO UPDATE SET
         ig_user_id             = EXCLUDED.ig_user_id,
         username               = EXCLUDED.username,
         access_token_encrypted = EXCLUDED.access_token_encrypted,
         token_type             = EXCLUDED.token_type,
         expires_at             = EXCLUDED.expires_at,
         scopes                 = EXCLUDED.scopes,
         is_connected           = true,
         last_error             = NULL,
         updated_at             = NOW()`,
      [userId, tokens.igUserId, tokens.username, encrypted, tokens.tokenType ?? 'bearer', tokens.expiresAt ?? null, tokens.scopes ?? null]
    );
  }

  async disconnect(userId: string): Promise<void> {
    await pool.query(
      `UPDATE instagram_credentials
       SET is_connected = false, access_token_encrypted = '', updated_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );
  }

  async setError(userId: string, error: string): Promise<void> {
    await pool.query(
      `INSERT INTO instagram_credentials (user_id, is_connected, last_error)
       VALUES ($1, false, $2)
       ON CONFLICT (user_id) DO UPDATE SET
         is_connected = false, last_error = $2, updated_at = NOW()`,
      [userId, error]
    );
  }
}
