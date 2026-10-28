import pool from '@/app/clients/db';

export interface FederationAuditEntry {
  direction: 'inbound' | 'outbound';
  peerId: string | null;
  principalId?: string | null;
  userId?: string | null;
  capability: string;
  target?: string | null;
  outcome: 'ok' | 'denied' | 'error';
  httpStatus?: number | null;
  errorCode?: string | null;
  durationMs?: number | null;
  requestBytes?: number | null;
  responseBytes?: number | null;
}

export interface FederationAuditRow extends FederationAuditEntry {
  id: string;
  at: Date;
}

export interface FederationAuditSink {
  record(entry: FederationAuditEntry): Promise<void>;
}

/** Federation audit log. Metadata only; never content or secrets. */
export class FederationAuditRepository implements FederationAuditSink {
  async record(entry: FederationAuditEntry): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO federation_audit_log
           (direction, peer_id, principal_id, user_id, capability, target, outcome,
            http_status, error_code, duration_ms, request_bytes, response_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          entry.direction, entry.peerId, entry.principalId ?? null, entry.userId ?? null,
          entry.capability, entry.target ?? null, entry.outcome, entry.httpStatus ?? null,
          entry.errorCode ?? null, entry.durationMs ?? null, entry.requestBytes ?? null, entry.responseBytes ?? null,
        ],
      );
    } catch (error) {
      // Auditing must never break a federation call.
      console.error('[Federation] failed to write audit log:', error);
    }
  }

  async listForPeer(peerId: string, limit = 50): Promise<FederationAuditRow[]> {
    const result = await pool.query(
      `SELECT id, at, direction, peer_id, principal_id, user_id, capability, target, outcome,
              http_status, error_code, duration_ms, request_bytes, response_bytes
       FROM federation_audit_log WHERE peer_id = $1 ORDER BY at DESC LIMIT $2`,
      [peerId, Math.min(Math.max(limit, 1), 200)],
    );
    return result.rows.map(row => ({
      id: String(row.id),
      at: row.at,
      direction: row.direction,
      peerId: row.peer_id,
      principalId: row.principal_id,
      userId: row.user_id,
      capability: row.capability,
      target: row.target,
      outcome: row.outcome,
      httpStatus: row.http_status,
      errorCode: row.error_code,
      durationMs: row.duration_ms,
      requestBytes: row.request_bytes,
      responseBytes: row.response_bytes,
    }));
  }
}

export const federationAuditRepository = new FederationAuditRepository();
