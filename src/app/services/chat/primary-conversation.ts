/**
 * Phase 4a: one primary conversation per user per agent, with rolling
 * compaction and "New topic" markers.
 *
 * Pure helpers (compaction plan, prompt history assembly) live here next to
 * the DB-backed functions so they can be unit-tested without Postgres.
 */
import pool from '@/app/clients/db';

/** Compact once the unsummarized history after the boundary exceeds either limit. */
export const COMPACTION_TRIGGER_MESSAGES = 40;
export const COMPACTION_TRIGGER_TOKENS = 16_000;
/** Messages left unsummarized after a compaction (the recent window). */
export const COMPACTION_KEEP_RECENT = 12;
/** Hard cap of raw messages sent to the model, in case compaction lags. */
export const PROMPT_MAX_MESSAGES = 40;
/** Latest segment summaries injected into the prompt. */
export const PROMPT_MAX_SEGMENTS = 4;
/** Max wait for the per-conversation write lock before giving up. */
export const CONVERSATION_LOCK_TIMEOUT_MS = 180_000;

export const TOPIC_MARKER_KIND = 'topic_marker';
export const TOPIC_MARKER_CONTENT = '--- New topic ---';

/** Advisory lock namespaces (first int of the two-key form). */
const LOCK_NS_WRITE = 41_530;
const LOCK_NS_COMPACT = 41_531;

export interface StoredMessage {
  id: string;
  role: string;
  content: string;
  created_at: Date | string;
  kind?: string | null;
}

export interface SegmentSummary {
  summary: string;
  start_at: Date | string;
  end_at: Date | string;
}

export interface PrimaryKey {
  userId: string;
  domain: string;
  source?: 'local' | 'federation';
  principalId?: string | null;
}

/** Rough token estimate (~4 chars per token), good enough for a trigger. */
export function estimateTokens(messages: Array<{ content: string }>): number {
  return messages.reduce((sum, m) => sum + Math.ceil((m.content?.length ?? 0) / 4), 0);
}

export function isTopicMarker(message: { kind?: string | null }): boolean {
  return message.kind === TOPIC_MARKER_KIND;
}

export interface CompactionPlan {
  toSummarize: StoredMessage[];
  keep: StoredMessage[];
}

/**
 * Given the unsummarized messages after the context boundary (oldest first),
 * decide whether to compact and which block to summarize.
 */
export function planCompaction(
  messages: StoredMessage[],
  opts: { triggerMessages?: number; triggerTokens?: number; keepRecent?: number } = {},
): CompactionPlan | null {
  const triggerMessages = opts.triggerMessages ?? COMPACTION_TRIGGER_MESSAGES;
  const triggerTokens = opts.triggerTokens ?? COMPACTION_TRIGGER_TOKENS;
  const keepRecent = opts.keepRecent ?? COMPACTION_KEEP_RECENT;
  const content = messages.filter(m => !isTopicMarker(m));
  if (content.length <= keepRecent) return null;
  if (content.length <= triggerMessages && estimateTokens(content) <= triggerTokens) return null;
  const cut = content.length - keepRecent;
  return { toSummarize: content.slice(0, cut), keep: content.slice(cut) };
}

/**
 * Prompt history for a primary conversation: the latest segment summaries as
 * one system note, then the raw messages after the boundary (capped).
 */
export function assemblePromptHistory(
  segments: SegmentSummary[],
  messages: StoredMessage[],
  opts: { maxSegments?: number; maxMessages?: number } = {},
): Array<{ role: string; content: string }> {
  const maxSegments = opts.maxSegments ?? PROMPT_MAX_SEGMENTS;
  const maxMessages = opts.maxMessages ?? PROMPT_MAX_MESSAGES;
  const out: Array<{ role: string; content: string }> = [];
  const latest = segments.slice(-maxSegments);
  if (latest.length > 0) {
    out.push({
      role: 'system',
      content: 'Summary of earlier parts of this conversation (oldest first, background only):\n'
        + latest.map(s => `- ${s.summary.trim()}`).join('\n'),
    });
  }
  const raw = messages.filter(m => !isTopicMarker(m) && (m.role === 'user' || m.role === 'assistant'));
  for (const m of raw.slice(-maxMessages)) out.push({ role: m.role, content: m.content });
  return out;
}

const time = (value: Date | string) => new Date(value).getTime();

/**
 * Split stored rows into what is still "live": after the latest topic marker,
 * and after the end of the latest segment that follows that marker.
 */
export function liveWindow(
  messages: StoredMessage[],
  segments: SegmentSummary[],
): { segments: SegmentSummary[]; messages: StoredMessage[] } {
  let markerAt = -Infinity;
  for (const m of messages) if (isTopicMarker(m)) markerAt = Math.max(markerAt, time(m.created_at));
  const liveSegments = segments.filter(s => time(s.start_at) > markerAt);
  const lastEnd = liveSegments.reduce((max, s) => Math.max(max, time(s.end_at)), -Infinity);
  const boundary = Math.max(markerAt, lastEnd);
  return { segments: liveSegments, messages: messages.filter(m => time(m.created_at) > boundary) };
}

// ---------------------------------------------------------------- DB side

/** Returns the primary conversation id, creating it on first use. */
export async function getOrCreatePrimaryConversation(key: PrimaryKey, title = 'Chat'): Promise<string> {
  const source = key.source ?? 'local';
  const principalId = key.principalId ?? null;
  const find = () => pool.query(
    `SELECT id FROM chat_conversations
     WHERE user_id = $1 AND source = $2 AND domain_slug = $3 AND is_primary
       AND federation_principal_id IS NOT DISTINCT FROM $4::uuid
     LIMIT 1`,
    [key.userId, source, key.domain, principalId],
  );
  const existing = await find();
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pool.query(
    `INSERT INTO chat_conversations (user_id, title, domain_slug, source, federation_principal_id, is_primary)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     ON CONFLICT DO NOTHING RETURNING id`,
    [key.userId, title, key.domain, source, principalId],
  );
  if (created.rows[0]) return created.rows[0].id;
  // Lost a creation race: the other writer's row is there now.
  const raced = await find();
  if (!raced.rows[0]) throw new Error('Failed to create primary conversation');
  return raced.rows[0].id;
}

export async function findPrimaryConversation(key: PrimaryKey): Promise<string | null> {
  const res = await pool.query(
    `SELECT id FROM chat_conversations
     WHERE user_id = $1 AND source = $2 AND domain_slug = $3 AND is_primary
       AND federation_principal_id IS NOT DISTINCT FROM $4::uuid
     LIMIT 1`,
    [key.userId, key.source ?? 'local', key.domain, key.principalId ?? null],
  );
  return res.rows[0]?.id ?? null;
}

export async function isPrimaryConversation(conversationId: string): Promise<boolean> {
  try {
    const res = await pool.query('SELECT is_primary FROM chat_conversations WHERE id = $1', [conversationId]);
    return res.rows[0]?.is_primary === true;
  } catch (error) {
    // Degrade to the legacy (unlocked, full-history) path; the turn reports its own DB errors.
    console.error('[PrimaryConversation] is_primary lookup failed:', error instanceof Error ? error.message : error);
    return false;
  }
}

/** Inserts a "New topic" marker. Context restarts after it; nothing is deleted. */
export async function insertTopicMarker(conversationId: string, userId: string): Promise<boolean> {
  return withConversationLock(conversationId, async () => {
    const res = await pool.query(
      `INSERT INTO chat_messages (conversation_id, role, content, kind)
       SELECT id, 'system', $3, $4 FROM chat_conversations WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [conversationId, userId, TOPIC_MARKER_CONTENT, TOPIC_MARKER_KIND],
    );
    if ((res.rowCount ?? 0) > 0) {
      await pool.query('UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);
    }
    return (res.rowCount ?? 0) > 0;
  });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Serializes writes to one conversation across channels (web, Telegram,
 * federation) with a session-level pg advisory lock on a dedicated client.
 * Returns the release function; always call it (try/finally).
 */
export async function acquireConversationLock(
  conversationId: string,
  timeoutMs = CONVERSATION_LOCK_TIMEOUT_MS,
): Promise<() => Promise<void>> {
  const client = await pool.connect();
  try {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const res = await client.query('SELECT pg_try_advisory_lock($1, hashtext($2)) AS ok', [LOCK_NS_WRITE, conversationId]);
      if (res.rows[0]?.ok) break;
      if (Date.now() >= deadline) throw new Error('Conversation is busy, please retry');
      await sleep(250);
    }
  } catch (error) {
    client.release();
    throw error;
  }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      await client.query('SELECT pg_advisory_unlock($1, hashtext($2))', [LOCK_NS_WRITE, conversationId]);
    } catch {
      // A failed unlock must not leak the lock to the next pool user.
      client.release(true);
      return;
    }
    client.release();
  };
}

export async function withConversationLock<T>(conversationId: string, fn: () => Promise<T>): Promise<T> {
  const release = await acquireConversationLock(conversationId);
  try {
    return await fn();
  } finally {
    await release();
  }
}

async function loadRows(conversationId: string) {
  const [messages, segments] = await Promise.all([
    pool.query(
      `SELECT id, role, content, created_at, kind FROM chat_messages
       WHERE conversation_id = $1 ORDER BY created_at ASC, id ASC`,
      [conversationId],
    ),
    pool.query(
      `SELECT summary, start_at, end_at FROM conversation_segments
       WHERE conversation_id = $1 ORDER BY end_at ASC`,
      [conversationId],
    ),
  ]);
  return liveWindow(messages.rows as StoredMessage[], segments.rows as SegmentSummary[]);
}

/** Bounded prompt history for a primary conversation (replaces loadMessages). */
export async function loadPrimaryPromptHistory(conversationId: string) {
  const live = await loadRows(conversationId);
  return assemblePromptHistory(live.segments, live.messages);
}

export type Summarize = (transcript: string) => Promise<string>;

export function transcriptOf(messages: StoredMessage[]): string {
  return messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n');
}

export const SEGMENT_SUMMARY_PROMPT = 'Summarize this part of an ongoing conversation between a user and their assistant. '
  + 'Keep facts, decisions, open tasks, names, numbers and the user\'s preferences. '
  + 'Write 3 to 8 short sentences in the language of the conversation. Do not add anything that is not there.';

/**
 * Summarizes the oldest live block into conversation_segments when the
 * trigger is met. Safe to call often; concurrent runs are skipped.
 */
export async function compactIfNeeded(conversationId: string, summarize: Summarize): Promise<boolean> {
  const client = await pool.connect();
  let locked = false;
  try {
    const res = await client.query('SELECT pg_try_advisory_lock($1, hashtext($2)) AS ok', [LOCK_NS_COMPACT, conversationId]);
    locked = res.rows[0]?.ok === true;
    if (!locked) return false;
    const live = await loadRows(conversationId);
    const plan = planCompaction(live.messages);
    if (!plan) return false;
    const summary = (await summarize(transcriptOf(plan.toSummarize))).trim();
    if (!summary) return false;
    const first = plan.toSummarize[0];
    const last = plan.toSummarize[plan.toSummarize.length - 1];
    await client.query(
      `INSERT INTO conversation_segments
         (conversation_id, summary, start_message_id, end_message_id, start_at, end_at, message_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [conversationId, summary, first.id, last.id, first.created_at, last.created_at, plan.toSummarize.length],
    );
    console.log(`[Compaction] ${conversationId}: summarized ${plan.toSummarize.length} messages`);
    return true;
  } finally {
    if (locked) {
      await client.query('SELECT pg_advisory_unlock($1, hashtext($2))', [LOCK_NS_COMPACT, conversationId]).catch(() => undefined);
    }
    client.release();
  }
}

/** Fire-and-forget compaction; never blocks or fails the reply. */
export function scheduleCompaction(conversationId: string, summarize: Summarize): void {
  setImmediate(() => {
    compactIfNeeded(conversationId, summarize).then(async compacted => {
      if (!compacted) return;
      // Phase 4b: embed the new segment for semantic search (no-op without a provider).
      const { scheduleSegmentEmbedding } = await import('./chat-history.service');
      scheduleSegmentEmbedding({ conversationId });
    }).catch(error => {
      console.error('[Compaction] failed:', error instanceof Error ? error.message : error);
    });
  });
}
