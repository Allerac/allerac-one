/**
 * Idempotency for inbound federated asks (federation P4b, mig 147).
 *
 * A home Unit sends `Idempotency-Key` (its local message id). The first request
 * with a key runs the agent; a repeat with the same body replays the stored
 * answer for 24h. A request stuck `in_progress` (crash, lost worker) expires
 * after STALE_IN_PROGRESS_MS so the key is not blocked for a day.
 */
import { createHash } from 'node:crypto';

export const DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;
export const STALE_IN_PROGRESS_MS = 2 * 60 * 1000;
export const IDEMPOTENCY_KEY = /^[A-Za-z0-9_:.-]{1,100}$/;

export interface StoredAskResponse {
  answer: string;
  truncated: boolean;
  conversation_id: string | null;
  message_id: string | null;
}

export type DedupeBegin =
  | { kind: 'new' }
  | { kind: 'replay'; response: StoredAskResponse }
  | { kind: 'in_progress' }
  | { kind: 'mismatch' };

export interface AskDedupeStore {
  /** Claims the key, or reports why it cannot be claimed. */
  begin(principalId: string, key: string, requestHash: string, now: Date): Promise<DedupeBegin>;
  finish(principalId: string, key: string, outcome: { status: 'done'; response: StoredAskResponse } | { status: 'failed' }): Promise<void>;
}

export function askRequestHash(parts: { agent: string; conversationId: string | null | undefined; question: string }): string {
  return createHash('sha256')
    .update(JSON.stringify([parts.agent, parts.conversationId ?? null, parts.question]))
    .digest('hex');
}

export interface DedupeRow {
  requestHash: string;
  status: 'in_progress' | 'done' | 'failed';
  response: StoredAskResponse | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Pure decision for an existing row; shared by the SQL and in-memory stores. */
export function decideExisting(row: DedupeRow, requestHash: string, now: Date): DedupeBegin | 'takeover' {
  if (now.getTime() - row.createdAt.getTime() > DEDUPE_TTL_MS) return 'takeover';
  if (row.requestHash !== requestHash) return { kind: 'mismatch' };
  if (row.status === 'done' && row.response) return { kind: 'replay', response: row.response };
  if (row.status === 'in_progress' && now.getTime() - row.updatedAt.getTime() < STALE_IN_PROGRESS_MS) {
    return { kind: 'in_progress' };
  }
  return 'takeover';
}

export class InMemoryAskDedupeStore implements AskDedupeStore {
  rows = new Map<string, DedupeRow>();

  async begin(principalId: string, key: string, requestHash: string, now: Date): Promise<DedupeBegin> {
    const id = `${principalId}:${key}`;
    const row = this.rows.get(id);
    if (row) {
      const decision = decideExisting(row, requestHash, now);
      if (decision !== 'takeover') return decision;
    }
    const createdAt = row && now.getTime() - row.createdAt.getTime() <= DEDUPE_TTL_MS ? row.createdAt : now;
    this.rows.set(id, { requestHash, status: 'in_progress', response: null, createdAt, updatedAt: now });
    return { kind: 'new' };
  }

  async finish(principalId: string, key: string, outcome: { status: 'done'; response: StoredAskResponse } | { status: 'failed' }) {
    const row = this.rows.get(`${principalId}:${key}`);
    if (!row) return;
    row.status = outcome.status;
    row.response = outcome.status === 'done' ? outcome.response : null;
  }
}
