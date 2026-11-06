/** Default, DB-backed GrantsService wiring (federation P4d). */
import pool from '@/app/clients/db';
import { federationAuditRepository } from './audit.repository';
import { GrantsService, type FederationKeyStore } from './grants';
import { peerRepository } from './peer.repository';

/** Only keys bound to a service principal (federation keys) are read or changed. */
export const federationKeyRepository: FederationKeyStore = {
  async scopesFor(principalId) {
    const result = await pool.query(
      `SELECT scopes FROM control_api_keys
        WHERE principal_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`,
      [principalId],
    );
    return Array.from(new Set(result.rows.flatMap(row => (row.scopes as string[] | null) ?? [])));
  },
  async setScopes(principalId, scopes) {
    const result = await pool.query(
      `UPDATE control_api_keys SET scopes = $2
        WHERE principal_id = $1 AND principal_id IS NOT NULL AND revoked_at IS NULL`,
      [principalId, scopes],
    );
    return result.rowCount ?? 0;
  },
};

export const grantsService = new GrantsService({
  peers: peerRepository,
  keys: federationKeyRepository,
  audit: federationAuditRepository,
});
