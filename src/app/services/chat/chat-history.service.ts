/**
 * Phase 4b: paged history, the agent chat archive and chat search.
 *
 * Everything here is scoped to one user and to the agent chat's own
 * conversations (local source, not tooling/public domains). Tickets live in
 * their own tables and are never searched.
 */
import pool from '@/app/clients/db';
import { EmbeddingService } from '@/app/services/rag/embedding.service';

export const PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
export const SEARCH_LIMIT = 20;
export const MAX_QUERY_LENGTH = 200;
/** Must match conversation_segments.embedding (migration 154). */
export const SEGMENT_EMBEDDING_DIMENSIONS = 768;
/** Cosine distance above which a semantic hit is dropped. */
export const MAX_SEMANTIC_DISTANCE = 0.6;
const RRF_K = 60;

/** Domains whose conversations are not part of the agent chat (own UIs or public). */
export const NON_AGENT_DOMAINS = ['tickets', 'code', 'job', 'openworld', 'sales'];

// ---------------------------------------------------------------- cursors

export interface PageCursor { createdAt: string; id: string }

/**
 * Cursors carry the full-precision timestamp. Postgres stores microseconds, a
 * JS Date only milliseconds, so rows select `created_at::text AS cursor_at` and
 * that exact string goes into the cursor; comparing a truncated value would
 * skip or repeat rows (and the anchor itself). Ties are broken by id.
 */
export function encodeCursor(row: { created_at: Date | string; id: string; cursor_at?: string | null }): string {
  const createdAt = row.cursor_at ?? new Date(row.created_at).toISOString();
  return Buffer.from(JSON.stringify([createdAt, row.id]), 'utf8').toString('base64url');
}

/** ISO 8601 or Postgres timestamptz text, up to microseconds. */
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decodeCursor(cursor: string | null | undefined): PageCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [createdAt, id] = parsed;
    if (typeof createdAt !== 'string' || typeof id !== 'string' || !UUID.test(id)) return null;
    if (!TIMESTAMP.test(createdAt)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export function clampPageSize(limit: number | undefined): number {
  if (!Number.isFinite(limit) || !limit || limit <= 0) return PAGE_SIZE;
  return Math.min(Math.floor(limit), MAX_PAGE_SIZE);
}

export interface HistoryMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
  kind: string | null;
  agent_run_id: string | null;
}

export interface MessagePage {
  messages: HistoryMessage[];
  /** Pass back as `before` to load older messages; null at the start. */
  olderCursor: string | null;
  /** Pass back as `after` to load newer messages; null when at the latest. */
  newerCursor: string | null;
}

/** Turns a DESC-fetched batch with one extra row into an ASC page + cursor. */
export function toPage<T extends { created_at: Date | string; id: string; cursor_at?: string | null }>(
  rowsDesc: T[], limit: number,
): { rows: T[]; hasMore: boolean } {
  const hasMore = rowsDesc.length > limit;
  return { rows: rowsDesc.slice(0, limit).reverse(), hasMore };
}

const MESSAGE_COLUMNS = 'cm.id, cm.role, cm.content, cm.created_at, cm.created_at::text AS cursor_at, cm.kind, cm.agent_run_id';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function serialize(row: Row): HistoryMessage {
  return {
    id: String(row.id),
    role: row.role,
    content: row.content,
    created_at: new Date(row.created_at).toISOString(),
    kind: row.kind ?? null,
    agent_run_id: row.agent_run_id ?? null,
  };
}

/** Latest page, or the page older than `before`. Owner-checked. */
export async function loadMessagePage(
  conversationId: string, userId: string, opts: { before?: string | null; limit?: number } = {},
): Promise<MessagePage> {
  const limit = clampPageSize(opts.limit);
  const before = decodeCursor(opts.before);
  const params: unknown[] = [conversationId, userId, limit + 1];
  let where = '';
  if (before) {
    params.push(before.createdAt, before.id);
    where = 'AND (cm.created_at, cm.id) < ($4::timestamptz, $5::uuid)';
  }
  const res = await pool.query(
    `SELECT ${MESSAGE_COLUMNS}
     FROM chat_messages cm JOIN chat_conversations cc ON cc.id = cm.conversation_id
     WHERE cm.conversation_id = $1 AND cc.user_id = $2 ${where}
     ORDER BY cm.created_at DESC, cm.id DESC LIMIT $3`,
    params,
  );
  const { rows, hasMore } = toPage(res.rows, limit);
  return {
    messages: rows.map(serialize),
    olderCursor: hasMore && rows.length ? encodeCursor(rows[0]) : null,
    newerCursor: null,
  };
}

/** Page newer than `after` (used after jumping into the middle of a conversation). */
export async function loadNewerMessages(
  conversationId: string, userId: string, after: string, limit?: number,
): Promise<MessagePage> {
  const size = clampPageSize(limit);
  const cursor = decodeCursor(after);
  if (!cursor) return { messages: [], olderCursor: null, newerCursor: null };
  const res = await pool.query(
    `SELECT ${MESSAGE_COLUMNS}
     FROM chat_messages cm JOIN chat_conversations cc ON cc.id = cm.conversation_id
     WHERE cm.conversation_id = $1 AND cc.user_id = $2
       AND (cm.created_at, cm.id) > ($4::timestamptz, $5::uuid)
     ORDER BY cm.created_at ASC, cm.id ASC LIMIT $3`,
    [conversationId, userId, size + 1, cursor.createdAt, cursor.id],
  );
  const hasMore = res.rows.length > size;
  const rows = res.rows.slice(0, size);
  return {
    messages: rows.map(serialize),
    olderCursor: null,
    newerCursor: hasMore && rows.length ? encodeCursor(rows[rows.length - 1]) : null,
  };
}

/** The page that contains `messageId`: half a page before it, half after. */
export async function loadPageAround(
  conversationId: string, userId: string, messageId: string, limit?: number,
): Promise<MessagePage | null> {
  const size = clampPageSize(limit);
  const anchor = await pool.query(
    `SELECT cm.id, cm.created_at, cm.created_at::text AS cursor_at FROM chat_messages cm
     JOIN chat_conversations cc ON cc.id = cm.conversation_id
     WHERE cm.id = $1 AND cm.conversation_id = $2 AND cc.user_id = $3`,
    [messageId, conversationId, userId],
  );
  const row = anchor.rows[0];
  if (!row) return null;
  const half = Math.max(1, Math.floor(size / 2));
  const cursorAfterAnchor = encodeCursor(row);
  // Older side includes the anchor (<= anchor); the newer side starts strictly after it.
  const [older, newer] = await Promise.all([
    pool.query(
      `SELECT ${MESSAGE_COLUMNS}
       FROM chat_messages cm WHERE cm.conversation_id = $1
         AND (cm.created_at, cm.id) <= ($2::timestamptz, $3::uuid)
       ORDER BY cm.created_at DESC, cm.id DESC LIMIT $4`,
      [conversationId, row.cursor_at, row.id, half + 1],
    ),
    loadNewerMessages(conversationId, userId, cursorAfterAnchor, half),
  ]);
  const { rows, hasMore } = toPage(older.rows, half);
  return {
    messages: [...rows.map(serialize), ...newer.messages],
    olderCursor: hasMore && rows.length ? encodeCursor(rows[0]) : null,
    newerCursor: newer.newerCursor,
  };
}

// ---------------------------------------------------------------- archive

export interface ArchivedConversation {
  id: string;
  title: string;
  domain_slug: string | null;
  updated_at: string;
  message_count: number;
}

/** SQL predicate: conversations that belong to the agent chat of user $1. */
function agentConversationScope(alias: string, userParam = '$1', domainsParam = '$2'): string {
  return `${alias}.user_id = ${userParam} AND ${alias}.source = 'local'
    AND COALESCE(${alias}.domain_slug, 'chat') <> ALL(${domainsParam}::text[])`;
}

export async function listArchivedConversations(userId: string, limit = 200): Promise<ArchivedConversation[]> {
  const res = await pool.query(
    `SELECT cc.id, cc.title, cc.domain_slug, cc.updated_at,
            (SELECT COUNT(*)::int FROM chat_messages m WHERE m.conversation_id = cc.id) AS message_count
     FROM chat_conversations cc
     WHERE ${agentConversationScope('cc')} AND NOT cc.is_primary
     ORDER BY cc.updated_at DESC LIMIT $3`,
    [userId, NON_AGENT_DOMAINS, Math.min(Math.max(1, limit), 500)],
  );
  return res.rows.map(r => ({
    id: String(r.id), title: r.title, domain_slug: r.domain_slug ?? null,
    updated_at: new Date(r.updated_at).toISOString(), message_count: r.message_count,
  }));
}

/** True when the conversation is part of the user's agent chat and readable there. */
export async function isAgentChatConversation(conversationId: string, userId: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM chat_conversations cc WHERE cc.id = $3 AND ${agentConversationScope('cc')}`,
    [userId, NON_AGENT_DOMAINS, conversationId],
  );
  return (res.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------- search

export interface SearchHit {
  conversationId: string;
  conversationTitle: string;
  isPrimary: boolean;
  /** Message to jump to. */
  messageId: string;
  snippet: string;
  createdAt: string;
  source: 'message' | 'segment' | 'memory';
  score: number;
}

/** Trims, collapses whitespace and caps the query; null when there is nothing to search. */
export function normalizeSearchQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const q = raw.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH);
  return q.length >= 2 ? q : null;
}

/** Short excerpt around the first matching term. */
export function makeSnippet(content: string, query: string, radius = 80): string {
  const text = content.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const terms = query.toLowerCase().split(' ').filter(t => t.length >= 2);
  let at = -1;
  for (const term of terms) {
    const i = lower.indexOf(term);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return text.slice(0, radius * 2) + (text.length > radius * 2 ? '…' : '');
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + radius);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

/**
 * Reciprocal-rank fusion of the full-text and semantic lists. Hits are keyed
 * by the message they jump to, so a segment and a message pointing to the
 * same place merge. Full-text wins ties (exact words are what users expect).
 */
export function mergeRankedResults(lists: SearchHit[][], limit = SEARCH_LIMIT): SearchHit[] {
  const merged = new Map<string, SearchHit>();
  lists.forEach((list, listIndex) => {
    list.forEach((hit, rank) => {
      const key = `${hit.conversationId}:${hit.messageId}`;
      const score = 1 / (RRF_K + rank + 1) + (listIndex === 0 ? 1e-6 : 0);
      const existing = merged.get(key);
      if (existing) existing.score += score;
      else merged.set(key, { ...hit, score });
    });
  });
  return [...merged.values()]
    .sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

async function fullTextSearch(userId: string, query: string, limit: number): Promise<SearchHit[]> {
  const res = await pool.query(
    `SELECT cm.id, cm.content, cm.created_at, cc.id AS conversation_id, cc.title, cc.is_primary,
            ts_rank(to_tsvector('simple', cm.content), q) AS rank
     FROM chat_messages cm
     JOIN chat_conversations cc ON cc.id = cm.conversation_id,
          websearch_to_tsquery('simple', $3) q
     WHERE ${agentConversationScope('cc')}
       AND cm.role IN ('user', 'assistant') AND cm.kind IS NULL
       AND to_tsvector('simple', cm.content) @@ q
     ORDER BY rank DESC, cm.created_at DESC
     LIMIT $4`,
    [userId, NON_AGENT_DOMAINS, query, limit],
  );
  return res.rows.map(r => ({
    conversationId: String(r.conversation_id), conversationTitle: r.title, isPrimary: r.is_primary === true,
    messageId: String(r.id), snippet: makeSnippet(r.content, query),
    createdAt: new Date(r.created_at).toISOString(), source: 'message' as const, score: 0,
  }));
}

async function semanticSearch(userId: string, vector: string, limit: number): Promise<SearchHit[]> {
  const [segments, memories] = await Promise.all([
    pool.query(
      `SELECT s.summary, s.start_message_id, s.start_at, cc.id AS conversation_id, cc.title, cc.is_primary,
              s.embedding <=> $3::vector AS distance
       FROM conversation_segments s JOIN chat_conversations cc ON cc.id = s.conversation_id
       WHERE ${agentConversationScope('cc')} AND s.embedding IS NOT NULL AND s.start_message_id IS NOT NULL
       ORDER BY s.embedding <=> $3::vector LIMIT $4`,
      [userId, NON_AGENT_DOMAINS, vector, limit],
    ),
    // Archived conversations have long-term memory summaries in the shared
    // semantic index; jump to their first message.
    pool.query(
      `SELECT k.content AS summary, cc.id AS conversation_id, cc.title, cc.is_primary,
              first_msg.id AS start_message_id, first_msg.created_at AS start_at,
              k.embedding <=> $3::vector AS distance
       FROM knowledge_semantic_index k
       JOIN conversation_summaries cs ON cs.id = k.source_id
       JOIN chat_conversations cc ON cc.id = cs.conversation_id
       JOIN LATERAL (
         SELECT m.id, m.created_at FROM chat_messages m WHERE m.conversation_id = cc.id
         ORDER BY m.created_at ASC, m.id ASC LIMIT 1
       ) first_msg ON TRUE
       WHERE k.user_id = $1 AND k.source_type = 'memory' AND ${agentConversationScope('cc')}
       ORDER BY k.embedding <=> $3::vector LIMIT $4`,
      [userId, NON_AGENT_DOMAINS, vector, limit],
    ).catch(() => ({ rows: [] as Row[] })),
  ]);
  const tagged = [
    ...segments.rows.map(r => ({ ...r, source: 'segment' as const })),
    ...memories.rows.map(r => ({ ...r, source: 'memory' as const })),
  ];
  return tagged
    .filter(r => Number(r.distance) <= MAX_SEMANTIC_DISTANCE)
    .sort((a, b) => Number(a.distance) - Number(b.distance))
    .slice(0, limit)
    .map(r => ({
      conversationId: String(r.conversation_id), conversationTitle: r.title, isPrimary: r.is_primary === true,
      messageId: String(r.start_message_id), snippet: makeSnippet(r.summary, ''),
      createdAt: new Date(r.start_at).toISOString(), source: r.source, score: 0,
    }));
}

export interface SearchDeps {
  embedQuery?: (text: string) => Promise<number[] | null>;
}

async function defaultEmbedQuery(text: string): Promise<number[] | null> {
  try {
    const service = new EmbeddingService();
    if (service.getEmbeddingDimension() !== SEGMENT_EMBEDDING_DIMENSIONS) return null;
    const { embedding } = await service.generateEmbedding(text, 'query');
    return embedding?.length === SEGMENT_EMBEDDING_DIMENSIONS ? embedding : null;
  } catch {
    return null; // No embedding provider: full-text only.
  }
}

/** Full-text + semantic search over the user's agent chat (primary and archive). */
export async function searchChatHistory(userId: string, rawQuery: unknown, deps: SearchDeps = {}): Promise<SearchHit[]> {
  const query = normalizeSearchQuery(rawQuery);
  if (!query) return [];
  const embed = deps.embedQuery ?? defaultEmbedQuery;
  const [fts, semantic] = await Promise.all([
    fullTextSearch(userId, query, SEARCH_LIMIT),
    embed(query).then(v => (v ? semanticSearch(userId, toVectorLiteral(v), SEARCH_LIMIT) : []))
      .catch(error => {
        console.warn('[ChatSearch] semantic search skipped:', error instanceof Error ? error.message : error);
        return [] as SearchHit[];
      }),
  ]);
  return mergeRankedResults([fts, semantic]);
}

// ---------------------------------------------------------------- segment embeddings

/**
 * Fills conversation_segments.embedding for pending rows. Tolerates a missing
 * or mismatched embedding provider (returns 0 and leaves rows NULL).
 */
export async function embedPendingSegments(opts: { conversationId?: string; userId?: string; limit?: number } = {}): Promise<number> {
  let service: EmbeddingService;
  try {
    service = new EmbeddingService();
    if (service.getEmbeddingDimension() !== SEGMENT_EMBEDDING_DIMENSIONS) return 0;
  } catch {
    return 0;
  }
  const params: unknown[] = [Math.min(opts.limit ?? 20, 100)];
  const filters: string[] = ['s.embedding IS NULL'];
  if (opts.conversationId) { params.push(opts.conversationId); filters.push(`s.conversation_id = $${params.length}`); }
  if (opts.userId) { params.push(opts.userId); filters.push(`cc.user_id = $${params.length}`); }
  const pending = await pool.query(
    `SELECT s.id, s.summary FROM conversation_segments s
     JOIN chat_conversations cc ON cc.id = s.conversation_id
     WHERE ${filters.join(' AND ')} ORDER BY s.created_at ASC LIMIT $1`,
    params,
  );
  let done = 0;
  for (const row of pending.rows) {
    try {
      const { embedding } = await service.generateEmbedding(row.summary, 'document');
      if (embedding?.length !== SEGMENT_EMBEDDING_DIMENSIONS) continue;
      await pool.query(
        `UPDATE conversation_segments SET embedding = $2::vector, embedding_version = $3, embedded_at = NOW()
         WHERE id = $1 AND embedding IS NULL`,
        [row.id, toVectorLiteral(embedding), service.getMetadata().version],
      );
      done += 1;
    } catch (error) {
      console.warn('[ChatSearch] segment embedding failed, will retry later:', error instanceof Error ? error.message : error);
      break; // Provider is likely down; stop this batch.
    }
  }
  return done;
}

/** Fire-and-forget wrapper. */
export function scheduleSegmentEmbedding(opts: { conversationId?: string; userId?: string } = {}): void {
  setImmediate(() => {
    embedPendingSegments(opts).catch(error => {
      console.warn('[ChatSearch] segment embedding sweep failed:', error instanceof Error ? error.message : error);
    });
  });
}
