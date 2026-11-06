import pool from '@/app/clients/db';
import type { StatusAgentRow, StatusAuditRow, StatusRunRow, StatusSource } from './status.service';

/**
 * SQL reads for the Control Tower status (federation P4d). Each query selects
 * only metadata columns; prompt, plan, result and message content are never read.
 */
const AUDIT_COLUMNS = `a.at, a.direction, p.unit_name AS peer_name, a.capability, a.target, a.outcome,
  a.http_status, a.duration_ms, a.error_code`;

function toAudit(row: Record<string, unknown>): StatusAuditRow {
  return {
    at: row.at as Date,
    direction: row.direction as StatusAuditRow['direction'],
    peerName: (row.peer_name as string | null) ?? null,
    capability: row.capability as string,
    target: (row.target as string | null) ?? null,
    outcome: row.outcome as StatusAuditRow['outcome'],
    httpStatus: (row.http_status as number | null) ?? null,
    durationMs: (row.duration_ms as number | null) ?? null,
    errorCode: (row.error_code as string | null) ?? null,
  };
}

export class StatusRepository implements StatusSource {
  async load() {
    const [runs, asks] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE status IN ('running', 'aggregating'))::int AS running,
                COUNT(*) FILTER (WHERE status = 'planning')::int AS queued
           FROM agent_runs WHERE completed_at IS NULL`,
      ),
      pool.query(
        `SELECT COUNT(*)::int AS running FROM federation_ask_dedupe WHERE mode = 'async' AND status = 'in_progress'`,
      ),
    ]);
    return {
      running: Number(runs.rows[0]?.running ?? 0),
      queued: Number(runs.rows[0]?.queued ?? 0),
      asyncRunning: Number(asks.rows[0]?.running ?? 0),
    };
  }

  async runs(since: Date, limit: number): Promise<StatusRunRow[]> {
    const result = await pool.query(
      `SELECT r.id, r.status, r.started_at, r.completed_at,
              (SELECT SUM(w.tokens_used) FROM agent_workers w WHERE w.run_id = r.id)::int AS tokens
         FROM agent_runs r
        WHERE r.started_at >= $1 OR r.completed_at IS NULL
        ORDER BY r.started_at DESC NULLS LAST
        LIMIT $2`,
      [since, limit],
    );
    return result.rows.map(row => ({
      id: row.id, status: row.status, startedAt: row.started_at ?? null, completedAt: row.completed_at ?? null,
      tokens: row.tokens ?? null,
    }));
  }

  async asks(since: Date, limit: number): Promise<StatusAuditRow[]> {
    const result = await pool.query(
      `SELECT ${AUDIT_COLUMNS}
         FROM federation_audit_log a LEFT JOIN federation_peers p ON p.id = a.peer_id
        WHERE a.capability = 'federation.agents.ask' AND a.at >= $1
        ORDER BY a.at DESC LIMIT $2`,
      [since, limit],
    );
    return result.rows.map(toAudit);
  }

  async events(since: Date, limit: number): Promise<StatusAuditRow[]> {
    const result = await pool.query(
      `SELECT ${AUDIT_COLUMNS}
         FROM federation_audit_log a LEFT JOIN federation_peers p ON p.id = a.peer_id
        WHERE a.outcome <> 'ok' AND a.at >= $1
        ORDER BY a.at DESC LIMIT $2`,
      [since, limit],
    );
    return result.rows.map(toAudit);
  }

  async agentStats(since: Date, limit: number): Promise<StatusAgentRow[]> {
    const result = await pool.query(
      `SELECT LOWER(target) AS slug, COUNT(*)::int AS asks,
              COUNT(*) FILTER (WHERE outcome <> 'ok')::int AS failures, MAX(at) AS last_at
         FROM federation_audit_log
        WHERE direction = 'inbound' AND capability = 'federation.agents.ask' AND at >= $1 AND target IS NOT NULL
        GROUP BY LOWER(target)
        ORDER BY asks DESC LIMIT $2`,
      [since, limit],
    );
    return result.rows.map(row => ({ slug: row.slug, asks: row.asks, failures: row.failures, lastAt: row.last_at ?? null }));
  }
}

export const statusRepository = new StatusRepository();
