/**
 * PostgreSQL adapter for oidc-provider.
 *
 * Implements the Adapter interface required by oidc-provider v8.
 * All model types (Session, AccessToken, AuthorizationCode, RefreshToken,
 * Interaction, Grant, etc.) share the oidc_models table, discriminated by
 * model_name.
 */

import pool from '@/app/clients/db';

export type AdapterPayload = Record<string, unknown>;

export class PostgreSQLAdapter {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
    const expiresAt = expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : null;

    await pool.query(
      `INSERT INTO oidc_models
         (model_name, id, payload, granted_at, consumed_at, expires_at, uid, user_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (model_name, id) DO UPDATE SET
         payload     = EXCLUDED.payload,
         granted_at  = EXCLUDED.granted_at,
         consumed_at = EXCLUDED.consumed_at,
         expires_at  = EXCLUDED.expires_at,
         uid         = EXCLUDED.uid,
         user_code   = EXCLUDED.user_code`,
      [
        this.name,
        id,
        JSON.stringify(payload),
        (payload.grantedAt as number | undefined) ?? null,
        payload.consumed ? Math.floor(Date.now() / 1000) : null,
        expiresAt,
        (payload.uid as string | undefined) ?? null,
        (payload.userCode as string | undefined) ?? null,
      ],
    );
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    const { rows } = await pool.query<{ payload: AdapterPayload; consumed_at: number | null }>(
      `SELECT payload, consumed_at
       FROM oidc_models
       WHERE model_name = $1
         AND id = $2
         AND (expires_at IS NULL OR expires_at > EXTRACT(EPOCH FROM NOW())::BIGINT)`,
      [this.name, id],
    );
    if (!rows[0]) return undefined;
    return {
      ...rows[0].payload,
      ...(rows[0].consumed_at ? { consumed: rows[0].consumed_at } : {}),
    };
  }

  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    const { rows } = await pool.query<{ payload: AdapterPayload; consumed_at: number | null }>(
      `SELECT payload, consumed_at
       FROM oidc_models
       WHERE model_name = $1
         AND user_code = $2
         AND (expires_at IS NULL OR expires_at > EXTRACT(EPOCH FROM NOW())::BIGINT)`,
      [this.name, userCode],
    );
    if (!rows[0]) return undefined;
    return {
      ...rows[0].payload,
      ...(rows[0].consumed_at ? { consumed: rows[0].consumed_at } : {}),
    };
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const { rows } = await pool.query<{ payload: AdapterPayload; consumed_at: number | null }>(
      `SELECT payload, consumed_at
       FROM oidc_models
       WHERE model_name = $1
         AND uid = $2
         AND (expires_at IS NULL OR expires_at > EXTRACT(EPOCH FROM NOW())::BIGINT)`,
      [this.name, uid],
    );
    if (!rows[0]) return undefined;
    return {
      ...rows[0].payload,
      ...(rows[0].consumed_at ? { consumed: rows[0].consumed_at } : {}),
    };
  }

  async consume(id: string): Promise<void> {
    await pool.query(
      `UPDATE oidc_models
       SET consumed_at = EXTRACT(EPOCH FROM NOW())::BIGINT
       WHERE model_name = $1 AND id = $2`,
      [this.name, id],
    );
  }

  async destroy(id: string): Promise<void> {
    await pool.query(
      `DELETE FROM oidc_models WHERE model_name = $1 AND id = $2`,
      [this.name, id],
    );
  }

  // Deletes ALL models linked to a grantId, across all model types.
  async revokeByGrantId(grantId: string): Promise<void> {
    await pool.query(
      `DELETE FROM oidc_models WHERE payload->>'grantId' = $1`,
      [grantId],
    );
  }
}
