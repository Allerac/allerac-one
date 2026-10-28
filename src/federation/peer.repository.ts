import pool from '@/app/clients/db';
import type { NewPeer, PeerPatch, PeerRecord, PeerStore } from './peer.types';

const COLUMN_MAP: Record<keyof Omit<PeerRecord, 'createdAt' | 'updatedAt'>, string> = {
  id: 'id',
  unitName: 'unit_name',
  displayName: 'display_name',
  origin: 'origin',
  protocolVersion: 'protocol_version',
  initiatedByUs: 'initiated_by_us',
  status: 'status',
  inboundPrincipalId: 'inbound_principal_id',
  inboundCapabilities: 'inbound_capabilities',
  outboundCapabilities: 'outbound_capabilities',
  outboundKeyEncrypted: 'outbound_key_encrypted',
  outboundKeyPrefix: 'outbound_key_prefix',
  nonceLocal: 'nonce_local',
  nonceRemote: 'nonce_remote',
  pairingSecretHash: 'pairing_secret_hash',
  pairingSecretEncrypted: 'pairing_secret_encrypted',
  remoteRequestId: 'remote_request_id',
  requestIp: 'request_ip',
  expiresAt: 'expires_at',
  createdBy: 'created_by',
  decidedBy: 'decided_by',
  decidedAt: 'decided_at',
  lastSeenAt: 'last_seen_at',
};

type PeerRow = Record<string, unknown>;

function mapRow(row: PeerRow): PeerRecord {
  const record = {} as Record<string, unknown>;
  for (const [key, column] of Object.entries(COLUMN_MAP)) record[key] = row[column] ?? null;
  record.inboundCapabilities = (row.inbound_capabilities as string[] | null) ?? [];
  record.outboundCapabilities = (row.outbound_capabilities as string[] | null) ?? [];
  record.createdAt = row.created_at;
  record.updatedAt = row.updated_at;
  return record as unknown as PeerRecord;
}

const OPEN = `('pending_outbound', 'pending_inbound', 'active')`;

export class PeerRepository implements PeerStore {
  async insert(peer: NewPeer): Promise<PeerRecord> {
    const entries = Object.entries(peer).filter(([key, value]) => key in COLUMN_MAP && value !== undefined);
    const columns = entries.map(([key]) => COLUMN_MAP[key as keyof typeof COLUMN_MAP]);
    const values = entries.map(([, value]) => value);
    const placeholders = values.map((_, index) => `$${index + 1}`);
    const result = await pool.query(
      `INSERT INTO federation_peers (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      values,
    );
    return mapRow(result.rows[0]);
  }

  async get(id: string): Promise<PeerRecord | null> {
    const result = await pool.query('SELECT * FROM federation_peers WHERE id = $1', [id]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async list(): Promise<PeerRecord[]> {
    const result = await pool.query('SELECT * FROM federation_peers ORDER BY created_at DESC');
    return result.rows.map(mapRow);
  }

  async findOpenByOrigin(origin: string): Promise<PeerRecord | null> {
    const result = await pool.query(
      `SELECT * FROM federation_peers WHERE origin = $1 AND status IN ${OPEN} LIMIT 1`,
      [origin],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findActiveByPrincipal(principalId: string): Promise<PeerRecord | null> {
    const result = await pool.query(
      `SELECT * FROM federation_peers WHERE inbound_principal_id = $1 AND status = 'active' LIMIT 1`,
      [principalId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async countPendingInbound(): Promise<number> {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM federation_peers WHERE status = 'pending_inbound'`,
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async expirePending(now: Date): Promise<number> {
    const result = await pool.query(
      `UPDATE federation_peers
       SET status = 'expired', pairing_secret_hash = NULL, pairing_secret_encrypted = NULL, updated_at = NOW()
       WHERE status IN ('pending_outbound', 'pending_inbound') AND expires_at IS NOT NULL AND expires_at <= $1`,
      [now],
    );
    return result.rowCount ?? 0;
  }

  async update(id: string, patch: PeerPatch): Promise<PeerRecord | null> {
    const entries = Object.entries(patch).filter(([key, value]) => key in COLUMN_MAP && key !== 'id' && value !== undefined);
    if (entries.length === 0) return this.get(id);
    const sets = entries.map(([key], index) => `${COLUMN_MAP[key as keyof typeof COLUMN_MAP]} = $${index + 2}`);
    const result = await pool.query(
      `UPDATE federation_peers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...entries.map(([, value]) => value)],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }
}

export const peerRepository = new PeerRepository();
