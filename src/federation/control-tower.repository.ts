import pool from '@/app/clients/db';
import type { ControlTowerPeerRow, ControlTowerStore, InboxAskRow } from './control-tower';
import type { BeatRecord, BeatState, HeartbeatStore } from './control-tower.heartbeat';
import { mapRow } from './peer.repository';
import type { PeerRecord } from './peer.types';
import { federationStatusSchema } from './status.schema';

/** SQL for the Control Tower heartbeat and read model (mig 149). Metadata only. */
export class ControlTowerRepository implements HeartbeatStore, ControlTowerStore {
  async activePeers(): Promise<Array<PeerRecord & { consecutiveMisses: number }>> {
    const result = await pool.query(`SELECT * FROM federation_peers WHERE status = 'active' ORDER BY unit_name`);
    return result.rows.map(row => ({ ...mapRow(row as never), consecutiveMisses: Number(row.consecutive_misses ?? 0) }));
  }

  async record(peerId: string, beat: BeatRecord): Promise<void> {
    await pool.query(
      `INSERT INTO federation_peer_heartbeats (peer_id, at, ok, latency_ms, app_version, error_code)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [peerId, beat.at, beat.ok, beat.latencyMs, beat.appVersion?.slice(0, 64) ?? null, beat.errorCode?.slice(0, 64) ?? null],
    );
    const keepSnapshot = beat.snapshot === undefined;
    await pool.query(
      `UPDATE federation_peers
          SET beat_state = $2, consecutive_misses = $3, last_beat_at = $4, last_latency_ms = $5, last_beat_error = $6,
              status_snapshot = CASE WHEN $7 THEN status_snapshot ELSE $8::jsonb END,
              status_snapshot_at = CASE WHEN $7 THEN status_snapshot_at WHEN $8::jsonb IS NULL THEN NULL ELSE $4 END
        WHERE id = $1`,
      [peerId, beat.state, beat.misses, beat.at, beat.latencyMs, beat.errorCode,
        keepSnapshot, keepSnapshot || beat.snapshot === null ? null : JSON.stringify(beat.snapshot)],
    );
  }

  async prune(before: Date): Promise<number> {
    const result = await pool.query('DELETE FROM federation_peer_heartbeats WHERE at < $1', [before]);
    return result.rowCount ?? 0;
  }

  async peers(): Promise<ControlTowerPeerRow[]> {
    const result = await pool.query(
      `SELECT p.*,
              COALESCE(h.ok_count, 0)::int AS beats_ok, COALESCE(h.total, 0)::int AS beats_total
         FROM federation_peers p
         LEFT JOIN (
           SELECT peer_id, COUNT(*) FILTER (WHERE ok) AS ok_count, COUNT(*) AS total
             FROM federation_peer_heartbeats WHERE at >= NOW() - INTERVAL '24 hours' GROUP BY peer_id
         ) h ON h.peer_id = p.id
        WHERE p.status = 'active'
        ORDER BY p.unit_name`,
    );
    return result.rows.map(row => {
      // The stored snapshot was validated on write; validate again on read so a
      // bad row can never reach the page.
      const snapshot = row.status_snapshot ? federationStatusSchema.safeParse(row.status_snapshot) : null;
      return {
        peer: mapRow(row as never),
        beatState: (row.beat_state ?? 'unknown') as BeatState,
        consecutiveMisses: Number(row.consecutive_misses ?? 0),
        lastBeatAt: row.last_beat_at ?? null,
        lastLatencyMs: row.last_latency_ms ?? null,
        lastBeatError: row.last_beat_error ?? null,
        snapshot: snapshot?.success ? snapshot.data : null,
        snapshotAt: row.status_snapshot_at ?? null,
        beats24h: { ok: Number(row.beats_ok), total: Number(row.beats_total) },
      };
    });
  }

  async inboxAsks(userId: string, since: Date, limit: number): Promise<InboxAskRow[]> {
    const result = await pool.query(
      `SELECT m.id, m.thread_id, m.status, m.error_code, m.created_at, t.agent_slug, p.unit_name
         FROM federated_messages m
         JOIN federated_threads t ON t.id = m.thread_id
         JOIN federation_peers p ON p.id = t.peer_id
        WHERE t.user_id = $1 AND m.role = 'user' AND (m.created_at >= $2 OR m.status = 'pending')
        ORDER BY m.created_at DESC LIMIT $3`,
      [userId, since, limit],
    );
    return result.rows.map(row => ({
      messageId: row.id, threadId: row.thread_id, peerName: row.unit_name, agentSlug: row.agent_slug,
      status: row.status, errorCode: row.error_code ?? null, createdAt: row.created_at,
    }));
  }
}

export const controlTowerRepository = new ControlTowerRepository();
