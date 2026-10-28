import pool from '@/app/clients/db';
import { apiKeyService, type CreatedControlApiKey } from '@/app/services/api-keys/api-key.service';

export interface ServicePrincipal {
  id: string;
  kind: string;
  name: string;
  peerUrl: string | null;
  actingUserId: string;
  createdBy: string | null;
  disabledAt: Date | null;
  createdAt: Date;
}

export class ServicePrincipalNameTakenError extends Error {
  constructor(name: string) {
    super(`A service principal named "${name}" already exists.`);
    this.name = 'ServicePrincipalNameTakenError';
  }
}

const COLUMNS = 'id, kind, name, peer_url, acting_user_id, created_by, disabled_at, created_at';

interface ServicePrincipalRow {
  id: string;
  kind: string;
  name: string;
  peer_url: string | null;
  acting_user_id: string;
  created_by: string | null;
  disabled_at: Date | null;
  created_at: Date;
}

function mapRow(row: ServicePrincipalRow): ServicePrincipal {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    peerUrl: row.peer_url ?? null,
    actingUserId: row.acting_user_id,
    createdBy: row.created_by ?? null,
    disabledAt: row.disabled_at ?? null,
    createdAt: row.created_at,
  };
}

/**
 * Service principals are non-human identities (one per peer Unit). Management is
 * admin-only; callers are expected to enforce that at the route layer.
 */
export class ServicePrincipalService {
  async create(params: {
    name: string;
    peerUrl?: string | null;
    actingUserId: string;
    createdBy: string;
  }): Promise<ServicePrincipal> {
    try {
      const result = await pool.query(
        `INSERT INTO service_principals (kind, name, peer_url, acting_user_id, created_by)
         VALUES ('peer', $1, $2, $3, $4)
         RETURNING ${COLUMNS}`,
        [params.name, params.peerUrl ?? null, params.actingUserId, params.createdBy],
      );
      return mapRow(result.rows[0]);
    } catch (error: unknown) {
      if ((error as { code?: string } | null)?.code === '23505') throw new ServicePrincipalNameTakenError(params.name);
      throw error;
    }
  }

  async list(): Promise<ServicePrincipal[]> {
    const result = await pool.query(
      `SELECT ${COLUMNS} FROM service_principals ORDER BY created_at DESC`,
    );
    return result.rows.map(mapRow);
  }

  async get(id: string): Promise<ServicePrincipal | null> {
    const result = await pool.query(`SELECT ${COLUMNS} FROM service_principals WHERE id = $1`, [id]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /** Disables the principal; all of its keys stop authenticating immediately. */
  async disable(id: string): Promise<boolean> {
    const result = await pool.query(
      `UPDATE service_principals SET disabled_at = COALESCE(disabled_at, NOW())
       WHERE id = $1 RETURNING id`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async createKey(params: {
    principal: ServicePrincipal;
    name: string;
    scopes: string[];
    expiresAt?: Date | null;
  }): Promise<CreatedControlApiKey> {
    return apiKeyService.create({
      userId: params.principal.actingUserId,
      name: params.name,
      scopes: params.scopes,
      expiresAt: params.expiresAt ?? null,
      principalId: params.principal.id,
    });
  }
}

export const servicePrincipalService = new ServicePrincipalService();
