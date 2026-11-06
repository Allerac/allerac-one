/**
 * Idempotency and result store for inbound federated asks (federation P4b/P4c,
 * migrations 147/148).
 *
 * A home Unit sends `Idempotency-Key`. The first request with a key runs the
 * agent; a repeat with the same body replays the stored answer for 24h.
 * Sync asks stuck `in_progress` (crash, lost worker) expire after
 * STALE_IN_PROGRESS_MS. Async asks (P4c) carry their own deadline; past it the
 * result reads as failed/timeout. The home fetches async results by key.
 */
import { createHash } from 'node:crypto';

export const DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;
export const STALE_IN_PROGRESS_MS = 2 * 60 * 1000;
/** Suggested first poll delay returned with 202 (P4c). */
export const ASYNC_POLL_AFTER_MS = 3_000;
export const IDEMPOTENCY_KEY = /^[A-Za-z0-9_:.-]{1,100}$/;

export interface StoredAskResponse {
  answer: string;
  truncated: boolean;
  conversation_id: string | null;
  message_id: string | null;
}

export type DedupeMode = 'sync' | 'async';

export type DedupeBegin =
  | { kind: 'new' }
  | { kind: 'replay'; response: StoredAskResponse }
  | { kind: 'in_progress' }
  | { kind: 'mismatch' };

export type AskResultState =
  | { status: 'done'; response: StoredAskResponse }
  | { status: 'pending' }
  | { status: 'failed'; errorCode: string };

export type DedupeFinish = { status: 'done'; response: StoredAskResponse } | { status: 'failed'; errorCode?: string | null };

export interface BeginOptions {
  mode?: DedupeMode;
  /** Async asks: when the background run is considered lost. */
  deadlineAt?: Date | null;
}

export interface AskDedupeStore {
  /** Claims the key, or reports why it cannot be claimed. */
  begin(principalId: string, key: string, requestHash: string, now: Date, options?: BeginOptions): Promise<DedupeBegin>;
  finish(principalId: string, key: string, outcome: DedupeFinish): Promise<void>;
  /** Current state of an ask by key (P4c), or null when unknown or expired. */
  get(principalId: string, key: string, now: Date): Promise<AskResultState | null>;
}

export function askRequestHash(parts: {
  agent: string; conversationId: string | null | undefined; question: string; primary?: boolean; topicReset?: boolean;
}): string {
  // v3 flags only join the hash when set, so v2 requests keep their old hash.
  const base: unknown[] = [parts.agent, parts.conversationId ?? null, parts.question];
  if (parts.primary || parts.topicReset) base.push({ primary: !!parts.primary, topicReset: !!parts.topicReset });
  return createHash('sha256')
    .update(JSON.stringify(base))
    .digest('hex');
}

export interface DedupeRow {
  requestHash: string;
  status: 'in_progress' | 'done' | 'failed';
  response: StoredAskResponse | null;
  createdAt: Date;
  updatedAt: Date;
  mode?: DedupeMode;
  deadlineAt?: Date | null;
  errorCode?: string | null;
}

function stillRunning(row: DedupeRow, now: Date): boolean {
  if (row.status !== 'in_progress') return false;
  if (row.deadlineAt) return now.getTime() < row.deadlineAt.getTime();
  return now.getTime() - row.updatedAt.getTime() < STALE_IN_PROGRESS_MS;
}

/** Pure decision for an existing row; shared by the SQL and in-memory stores. */
export function decideExisting(row: DedupeRow, requestHash: string, now: Date): DedupeBegin | 'takeover' {
  if (now.getTime() - row.createdAt.getTime() > DEDUPE_TTL_MS) return 'takeover';
  if (row.requestHash !== requestHash) return { kind: 'mismatch' };
  if (row.status === 'done' && row.response) return { kind: 'replay', response: row.response };
  if (stillRunning(row, now)) return { kind: 'in_progress' };
  return 'takeover';
}

/** Pure read model for GET /federation/asks/:key. */
export function resultState(row: DedupeRow | null, now: Date): AskResultState | null {
  if (!row || now.getTime() - row.createdAt.getTime() > DEDUPE_TTL_MS) return null;
  if (row.status === 'done' && row.response) return { status: 'done', response: row.response };
  if (stillRunning(row, now)) return { status: 'pending' };
  if (row.status === 'in_progress') return { status: 'failed', errorCode: 'timeout' };
  return { status: 'failed', errorCode: row.errorCode ?? 'failed' };
}

export class InMemoryAskDedupeStore implements AskDedupeStore {
  rows = new Map<string, DedupeRow>();

  async begin(principalId: string, key: string, requestHash: string, now: Date, options: BeginOptions = {}): Promise<DedupeBegin> {
    const id = `${principalId}:${key}`;
    const row = this.rows.get(id);
    if (row) {
      const decision = decideExisting(row, requestHash, now);
      if (decision !== 'takeover') return decision;
    }
    const createdAt = row && now.getTime() - row.createdAt.getTime() <= DEDUPE_TTL_MS ? row.createdAt : now;
    this.rows.set(id, {
      requestHash, status: 'in_progress', response: null, createdAt, updatedAt: now,
      mode: options.mode ?? 'sync', deadlineAt: options.deadlineAt ?? null, errorCode: null,
    });
    return { kind: 'new' };
  }

  async finish(principalId: string, key: string, outcome: DedupeFinish) {
    const row = this.rows.get(`${principalId}:${key}`);
    if (!row) return;
    row.status = outcome.status;
    row.response = outcome.status === 'done' ? outcome.response : null;
    row.errorCode = outcome.status === 'failed' ? outcome.errorCode ?? null : null;
  }

  async get(principalId: string, key: string, now: Date) {
    return resultState(this.rows.get(`${principalId}:${key}`) ?? null, now);
  }
}
