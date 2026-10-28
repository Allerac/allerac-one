import crypto from 'crypto';
import pool from '@/app/clients/db';
import type { User } from '@/app/services/auth/auth.service';
import { hasScope, isServiceAllowedScope, unknownScopes } from './api-key-scopes';

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

export interface ServicePrincipalRef {
  id: string;
  name: string;
  kind: string;
}

/** User returned by bearer validation; `principal` is set for service keys. */
export type BearerUser = User & { principal?: ServicePrincipalRef };

export interface CreatedControlApiKey {
  apiKey: ControlApiKey;
  secret: string;
}

export class ApiKeyMissingScopeError extends Error {
  constructor(public readonly requiredScope: string) {
    super(`API key is missing required scope: ${requiredScope}`);
    this.name = 'ApiKeyMissingScopeError';
  }
}

export class ApiKeyInvalidScopesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyInvalidScopesError';
  }
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
    scopes: string[];
    expiresAt?: Date | null;
    principalId?: string | null;
  }): Promise<CreatedControlApiKey> {
    // A key without scopes would grant nothing, so refuse to create one.
    if (!Array.isArray(params.scopes) || params.scopes.length === 0) {
      throw new ApiKeyInvalidScopesError('An API key needs at least one scope.');
    }
    const unknown = unknownScopes(params.scopes);
    if (unknown.length > 0) {
      throw new ApiKeyInvalidScopesError(`Unknown scope(s): ${unknown.join(', ')}`);
    }
    if (params.principalId) {
      const disallowed = params.scopes.filter(scope => !isServiceAllowedScope(scope));
      if (disallowed.length > 0) {
        throw new ApiKeyInvalidScopesError(`Scope(s) not allowed for service keys: ${disallowed.join(', ')}`);
      }
    }
    const scopes = Array.from(new Set(params.scopes));

    const secret = this.generateToken();
    const tokenHash = this.hashToken(secret);
    const tokenPrefix = this.tokenLookupPrefix(secret);

    const values: unknown[] = [params.userId, params.name, tokenPrefix, tokenHash, scopes, params.expiresAt ?? null];
    const result = params.principalId
      ? await pool.query(
        `INSERT INTO control_api_keys (user_id, name, token_prefix, token_hash, scopes, expires_at, principal_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, user_id, name, token_prefix, scopes, last_used_at, revoked_at, expires_at, created_at`,
        [...values, params.principalId],
      )
      : await pool.query(
        `INSERT INTO control_api_keys (user_id, name, token_prefix, token_hash, scopes, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, user_id, name, token_prefix, scopes, last_used_at, revoked_at, expires_at, created_at`,
        values,
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
       WHERE user_id = $1 AND principal_id IS NULL
       ORDER BY created_at DESC`,
      [userId],
    );

    return result.rows.map(mapRow);
  }

  async revoke(params: { userId: string; keyId: string }): Promise<boolean> {
    const result = await pool.query(
      `UPDATE control_api_keys
       SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE id = $1 AND user_id = $2 AND principal_id IS NULL
       RETURNING id`,
      [params.keyId, params.userId],
    );

    return result.rowCount > 0;
  }

  async validateBearerToken(token: string, requiredScope: string): Promise<BearerUser | null> {
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
         k.scopes,
         k.principal_id,
         sp.name AS principal_name,
         sp.kind AS principal_kind
       FROM control_api_keys k
       LEFT JOIN service_principals sp ON sp.id = k.principal_id
       JOIN users u ON u.id = COALESCE(sp.acting_user_id, k.user_id)
       WHERE k.token_prefix = $1
         AND k.token_hash = $2
         AND k.revoked_at IS NULL
         AND (k.expires_at IS NULL OR k.expires_at > NOW())
         AND (k.principal_id IS NULL OR sp.disabled_at IS NULL)
         AND u.is_active = true
       LIMIT 1`,
      [tokenPrefix, tokenHash],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const isService = Boolean(row.principal_id);
    // Deny by default: empty scope lists and unknown scopes grant nothing.
    // Service keys are additionally limited to the service allow-list.
    const allowed = hasScope(row.scopes, requiredScope)
      && (!isService || isServiceAllowedScope(requiredScope));

    if (isService) {
      await this.recordUsage(row.key_id, row.principal_id, requiredScope, allowed);
    }
    if (!allowed) {
      throw new ApiKeyMissingScopeError(requiredScope);
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
      ...(isService
        ? { principal: { id: row.principal_id, name: row.principal_name, kind: row.principal_kind } }
        : {}),
    };
  }

  private async recordUsage(keyId: string, principalId: string, scope: string, allowed: boolean): Promise<void> {
    try {
      await pool.query(
        'INSERT INTO control_api_key_usage (key_id, principal_id, scope, allowed) VALUES ($1, $2, $3, $4)',
        [keyId, principalId, scope, allowed],
      );
    } catch (error) {
      // Usage logging must never break request handling.
      console.error('[ApiKeyService] failed to record key usage:', error);
    }
  }
}

export const apiKeyService = new ApiKeyService();
