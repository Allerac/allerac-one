/**
 * @jest-environment node
 */
jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: jest.fn(), connect: jest.fn() } }));
jest.mock('@/app/services/rag/embedding.service', () => ({ EmbeddingService: jest.fn() }));

import pool from '@/app/clients/db';
import {
  MAX_PAGE_SIZE,
  PAGE_SIZE,
  clampPageSize,
  decodeCursor,
  encodeCursor,
  loadMessagePage,
  makeSnippet,
  mergeRankedResults,
  normalizeSearchQuery,
  searchChatHistory,
  toPage,
  type SearchHit,
} from '@/app/services/chat/chat-history.service';

const mockQuery = jest.mocked(pool.query) as jest.Mock;
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('cursors', () => {
  it('round-trips created_at and id', () => {
    const cursor = encodeCursor({ created_at: new Date('2026-11-02T10:00:00.123Z'), id: ID });
    expect(decodeCursor(cursor)).toEqual({ createdAt: '2026-11-02T10:00:00.123Z', id: ID });
  });

  it('keeps the full-precision Postgres timestamp when present (no ms truncation)', () => {
    const cursor = encodeCursor({ created_at: new Date(), cursor_at: '2026-11-02 19:46:01.123456+00', id: ID });
    expect(decodeCursor(cursor)).toEqual({ createdAt: '2026-11-02 19:46:01.123456+00', id: ID });
  });

  it('rejects garbage, bad ids and bad dates', () => {
    expect(decodeCursor('not-base64-json')).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify(['2026-01-01', 'x'])).toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify(['nope', ID])).toString('base64url'))).toBeNull();
    expect(decodeCursor(null)).toBeNull();
  });

  it('clamps page size', () => {
    expect(clampPageSize(undefined)).toBe(PAGE_SIZE);
    expect(clampPageSize(-1)).toBe(PAGE_SIZE);
    expect(clampPageSize(10_000)).toBe(MAX_PAGE_SIZE);
  });

  it('turns a DESC batch with one extra row into an ASC page', () => {
    const rows = [3, 2, 1].map(i => ({ id: `m${i}`, created_at: new Date(i * 1000) }));
    expect(toPage(rows, 2)).toEqual({ rows: [rows[1], rows[0]], hasMore: true });
    expect(toPage(rows.slice(0, 2), 2).hasMore).toBe(false);
  });
});

describe('loadMessagePage', () => {
  beforeEach(() => mockQuery.mockReset());

  it('uses keyset pagination scoped to the owner and returns an older cursor', async () => {
    const rows = [5, 4, 3].map(i => ({
      id: `0f8fad5b-d9cb-469f-a165-70867728950${i}`, role: 'user', content: `m${i}`,
      created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)), kind: null, agent_run_id: null,
    }));
    mockQuery.mockResolvedValueOnce({ rows });
    const before = encodeCursor({ created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, 6)), id: ID });
    const page = await loadMessagePage('conv', 'user-1', { before, limit: 2 });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('cc.user_id = $2');
    expect(sql).toContain('(cm.created_at, cm.id) < ($4::timestamptz, $5::uuid)');
    expect(params).toEqual(['conv', 'user-1', 3, '2026-01-01T00:00:06.000Z', ID]);
    expect(page.messages.map(m => m.content)).toEqual(['m4', 'm5']);
    expect(decodeCursor(page.olderCursor)?.id).toBe(rows[1].id);
  });

  it('has no older cursor on the first page of a short conversation', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const page = await loadMessagePage('conv', 'user-1');
    expect(page).toEqual({ messages: [], olderCursor: null, newerCursor: null });
    expect(mockQuery.mock.calls[0][1]).toEqual(['conv', 'user-1', PAGE_SIZE + 1]);
  });
});

describe('search helpers', () => {
  it('normalizes queries', () => {
    expect(normalizeSearchQuery('  hello\n  world ')).toBe('hello world');
    expect(normalizeSearchQuery('a')).toBeNull();
    expect(normalizeSearchQuery(42)).toBeNull();
    expect(normalizeSearchQuery('x'.repeat(500))).toHaveLength(200);
  });

  it('builds a snippet around the first match', () => {
    const text = `${'a '.repeat(100)}needle ${'b '.repeat(100)}`;
    const snippet = makeSnippet(text, 'needle', 10);
    expect(snippet).toContain('needle');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
  });

  const hit = (messageId: string, source: SearchHit['source'] = 'message'): SearchHit => ({
    conversationId: 'c', conversationTitle: 't', isPrimary: true, messageId, snippet: messageId,
    createdAt: '2026-01-01T00:00:00.000Z', source, score: 0,
  });

  it('merges full-text and semantic lists with reciprocal rank fusion', () => {
    const merged = mergeRankedResults([
      [hit('a'), hit('b'), hit('c')],
      [hit('c', 'segment'), hit('d', 'segment')],
    ]);
    // c appears in both lists and rises to the top; full-text wins first-rank ties.
    expect(merged.map(h => h.messageId)).toEqual(['c', 'a', 'b', 'd']);
    expect(merged[0].source).toBe('message');
  });

  it('caps the merged list', () => {
    expect(mergeRankedResults([[hit('a'), hit('b'), hit('c')]], 2)).toHaveLength(2);
  });
});

describe('searchChatHistory', () => {
  beforeEach(() => mockQuery.mockReset());

  it('falls back to full-text only when no embedding is available, scoped to the user', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'm1', content: 'the needle is here', created_at: new Date(), conversation_id: 'c1', title: 'Chat', is_primary: false }],
    });
    const hits = await searchChatHistory('user-1', 'needle', { embedQuery: async () => null });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ conversationId: 'c1', messageId: 'm1', isPrimary: false, source: 'message' });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("cc.user_id = $1 AND cc.source = 'local'");
    expect(sql).toContain("websearch_to_tsquery('simple', $3)");
    expect(params[0]).toBe('user-1');
    expect(params[1]).toContain('tickets');
  });

  it('survives a failing embedding provider', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const hits = await searchChatHistory('user-1', 'needle', { embedQuery: async () => { throw new Error('down'); } });
    expect(hits).toEqual([]);
  });

  it('does not query for empty input', async () => {
    expect(await searchChatHistory('user-1', ' ')).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
