import crypto from 'crypto';
import pool from '@/app/clients/db';
import type { User } from '@/app/services/auth/auth.service';

const TOKEN_PREFIX = 'alr_live_';
const TOKEN_RANDOM_BYTES = 32;
const TOKEN_LOOKUP_PREFIX_LENGTH = 24;

export interface ControlApiKey {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface CreatedControlApiKey {
  apiKey: ControlApiKey;
  secret: string;
}

function mapRow(row: Record<string, any>): ControlApiKey {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    prefix: row.token_prefix,
    scopes: row.scopes ?? [],
    lastUsedAt: row.last_used_at ?? null,
    revokedAt: row.revoked_at ?? null,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at,
  };
}

export class ApiKeyService {
  generateToken(): string {
    return `${TOKEN_PREFIX}${crypto.randomBytes(TOKEN_RANDOM_BYTES).toString('hex')}`;
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  tokenLookupPrefix(token: string): string {
    return token.slice(0, TOKEN_LOOKUP_PREFIX_LENGTH);
  }

  async create(params: {
    userId: string;
    name: string;
    scopes?: string[];
    expiresAt?: Date | null;
  }): Promise<CreatedControlApiKey> {
    const secret = this.generateToken();
    const tokenHash = this.hashToken(secret);
    const tokenPrefix = this.tokenLookupPrefix(secret);

    const result = await pool.query(
      `INSERT INTO control_api_keys (user_id, name, token_prefix, token_hash, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, name, token_prefix, scopes, last_used_at, revoked_at, expires_at, created_at`,
      [params.userId, params.name, tokenPrefix, tokenHash, params.scopes ?? [], params.expiresAt ?? null],
    );

    return {
      apiKey: mapRow(result.rows[0]),
      secret,
    };
  }

  async list(userId: string): Promise<ControlApiKey[]> {
    const result = await pool.query(
      `SELECT id, user_id, name, token_prefix, scopes, last_used_at, revoked_at, expires_at, created_at
       FROM control_api_keys
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );

    return result.rows.map(mapRow);
  }

  async revoke(params: { userId: string; keyId: string }): Promise<boolean> {
    const result = await pool.query(
      `UPDATE control_api_keys
       SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [params.keyId, params.userId],
    );

    return result.rowCount > 0;
  }

  async validateBearerToken(token: string, requiredScope?: string): Promise<User | null> {
    if (!token.startsWith(TOKEN_PREFIX)) return null;

    const tokenHash = this.hashToken(token);
    const tokenPrefix = this.tokenLookupPrefix(token);

    const result = await pool.query(
      `SELECT
         k.id AS key_id,
         u.id,
         u.email,
         u.name,
         u.is_admin,
         u.created_at,
         k.scopes
       FROM control_api_keys k
       JOIN users u ON u.id = k.user_id
       WHERE k.token_prefix = $1
         AND k.token_hash = $2
         AND k.revoked_at IS NULL
         AND (k.expires_at IS NULL OR k.expires_at > NOW())
         AND u.is_active = true
       LIMIT 1`,
      [tokenPrefix, tokenHash],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const scopes = (row.scopes ?? []) as string[];
    if (requiredScope && scopes.length > 0 && !scopes.includes(requiredScope)) {
      return null;
    }

    await pool.query(
      'UPDATE control_api_keys SET last_used_at = NOW() WHERE id = $1',
      [row.key_id],
    );

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      is_admin: row.is_admin,
      created_at: row.created_at,
    };
  }
}

export const apiKeyService = new ApiKeyService();
