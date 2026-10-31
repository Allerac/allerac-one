import pool from '@/app/clients/db';
import { DEDUPE_TTL_MS, decideExisting, type AskDedupeStore, type DedupeBegin, type StoredAskResponse } from './ask-dedupe';

type Row = Record<string, unknown>;

/** SQL store for federation_ask_dedupe (mig 147). */
export class AskDedupeRepository implements AskDedupeStore {
  async begin(principalId: string, key: string, requestHash: string, now: Date): Promise<DedupeBegin> {
    // Opportunistic pruning; the created_at index keeps it cheap.
    await pool.query('DELETE FROM federation_ask_dedupe WHERE created_at < $1', [new Date(now.getTime() - DEDUPE_TTL_MS)]);
    const inserted = await pool.query(
      `INSERT INTO federation_ask_dedupe (principal_id, idempotency_key, request_hash, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'in_progress', $4, $4)
       ON CONFLICT (principal_id, idempotency_key) DO NOTHING
       RETURNING principal_id`,
      [principalId, key, requestHash, now],
    );
    if (inserted.rowCount) return { kind: 'new' };

    const existing = await pool.query(
      'SELECT * FROM federation_ask_dedupe WHERE principal_id = $1 AND idempotency_key = $2',
      [principalId, key],
    );
    const row = existing.rows[0] as Row | undefined;
    if (!row) return this.begin(principalId, key, requestHash, now);
    const decision = decideExisting({
      requestHash: String(row.request_hash),
      status: row.status as 'in_progress' | 'done' | 'failed',
      response: (row.response as StoredAskResponse | null) ?? null,
      createdAt: new Date(row.created_at as Date),
      updatedAt: new Date(row.updated_at as Date),
    }, requestHash, now);
    if (decision !== 'takeover') return decision;

    // Compare-and-swap on updated_at so two concurrent retries cannot both win.
    const claimed = await pool.query(
      `UPDATE federation_ask_dedupe
          SET status = 'in_progress', request_hash = $3, response = NULL, updated_at = $4,
              created_at = CASE WHEN created_at < $6 THEN $4 ELSE created_at END
        WHERE principal_id = $1 AND idempotency_key = $2 AND updated_at = $5
        RETURNING principal_id`,
      [principalId, key, requestHash, now, row.updated_at, new Date(now.getTime() - DEDUPE_TTL_MS)],
    );
    return claimed.rowCount ? { kind: 'new' } : { kind: 'in_progress' };
  }

  async finish(principalId: string, key: string, outcome: { status: 'done'; response: StoredAskResponse } | { status: 'failed' }) {
    await pool.query(
      `UPDATE federation_ask_dedupe SET status = $3, response = $4, updated_at = NOW()
        WHERE principal_id = $1 AND idempotency_key = $2`,
      [principalId, key, outcome.status, outcome.status === 'done' ? JSON.stringify(outcome.response) : null],
    );
  }
}

export const askDedupeRepository = new AskDedupeRepository();
