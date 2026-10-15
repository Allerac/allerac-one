import '../../__mocks__/db';
import pool from '@/app/clients/db';
import { isDomainEnabled } from '@/modules/registry';

jest.mock('@/modules/registry', () => ({ isDomainEnabled: jest.fn(() => true) }));
import {
  KnowledgeSearchService,
  formatKnowledgeContext,
  normalizeSourceTypes,
  rankBoost,
} from '@/app/services/knowledge/knowledge-search.service';

const query = jest.mocked(pool.query);
const user = { id: 'user-1', is_admin: false };

function embeddings(ok = true) {
  return {
    generateEmbedding: jest.fn(async () => {
      if (!ok) throw new Error('embedding backend down');
      return { embedding: [0.1, 0.2], tokenCount: 1 };
    }),
  };
}

/** Routes each SQL statement to canned rows by what it reads. */
function routeQueries(rows: { chunks?: unknown[]; memoryVectors?: unknown[]; memoryLexical?: unknown[]; notesLexical?: unknown[] }) {
  query.mockImplementation((async (sql: string) => {
    if (sql.includes('FROM document_chunks')) return { rows: rows.chunks ?? [] };
    if (sql.includes('FROM knowledge_semantic_index')) return { rows: rows.memoryVectors ?? [] };
    if (sql.includes('FROM conversation_summaries')) return { rows: rows.memoryLexical ?? [] };
    if (sql.includes('FROM user_notes')) return { rows: rows.notesLexical ?? [] };
    throw new Error(`unexpected SQL: ${sql}`);
  }) as never);
}

const now = new Date().toISOString();
const noteChunk = { document_id: 'doc-n', content: 'Editor setup: VS Code', similarity: 0.82, source_type: 'note', filename: 'old title', domain_slug: 'notes', created_at: now, note_id: 'note-1', note_title: 'Editor setup', note_updated_at: now };
const uploadChunk = { document_id: 'doc-1', content: 'manual text', similarity: 0.6, source_type: 'upload', filename: 'manual.pdf', domain_slug: 'chat', created_at: now, note_id: null, note_title: null, note_updated_at: null };
const memory = { id: 'mem-1', summary: 'Gian uses VS Code', key_topics: ['editor'], importance_score: 8, domain_slug: 'chat', created_at: now };

describe('KnowledgeSearchService', () => {
  beforeEach(() => {
    query.mockReset();
    jest.mocked(isDomainEnabled).mockReturnValue(true);
  });

  it('returns one hit per source across notes, documents and memories, ranked', async () => {
    routeQueries({ chunks: [noteChunk, uploadChunk], memoryVectors: [{ ...memory, similarity: 0.7 }], memoryLexical: [memory] });
    const result = await new KnowledgeSearchService(embeddings()).search(user, 'preferred editor');

    expect(result.semanticAvailable).toBe(true);
    expect(result.hits.map(h => `${h.source_type}:${h.source_id}`)).toEqual(['note:note-1', 'memory:mem-1', 'document:doc-1']);
    const mem = result.hits.find(h => h.source_type === 'memory')!;
    expect(mem.match).toBe('both');
    expect(mem.similarity).toBe(0.7);
    expect(result.hits[0]).toEqual(expect.objectContaining({ title: 'Editor setup', domain_slug: 'notes' }));
  });

  it('never queries or returns tickets', async () => {
    routeQueries({ chunks: [noteChunk, uploadChunk], memoryVectors: [], memoryLexical: [memory] });
    const service = new KnowledgeSearchService(embeddings());

    const onlyTickets = await service.search(user, 'deploy bug', { sourceTypes: ['ticket'] });
    expect(onlyTickets.hits).toEqual([]);
    expect(query).not.toHaveBeenCalled();

    const all = await service.search(user, 'deploy bug', { sourceTypes: ['ticket', 'note', 'document', 'memory'] });
    expect(all.hits.every(h => ['note', 'document', 'memory'].includes(h.source_type))).toBe(true);
    for (const [sql, params] of query.mock.calls as unknown as [string, unknown[]][]) {
      expect(sql).not.toMatch(/\btickets?\b/i);
      expect(JSON.stringify(params)).not.toContain('ticket');
    }
    const chunkCall = (query.mock.calls as unknown as [string, unknown[]][]).find(([sql]) => sql.includes('FROM document_chunks'))!;
    expect(chunkCall[1][2]).toEqual(['upload', 'crawler', 'note']);
    expect(normalizeSourceTypes(['ticket', 'TICKET'])).toEqual([]);
  });

  it('excludes archived notes by default and includes them on request', async () => {
    routeQueries({});
    const service = new KnowledgeSearchService(embeddings());
    await service.search(user, 'editor', { sourceTypes: ['note'] });
    let [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('n.archived_at IS NULL');
    expect(params[3]).toBe(false);

    query.mockClear();
    await service.search(user, 'editor', { sourceTypes: ['note'], includeArchived: true });
    [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(params[3]).toBe(true);
  });

  it('filters by domain access unless a domain was authorized by the caller', async () => {
    routeQueries({});
    const service = new KnowledgeSearchService(embeddings());
    await service.search(user, 'editor');
    for (const [sql, params] of query.mock.calls as unknown as [string, unknown[]][]) {
      expect(sql).toContain('user_domain_access');
      expect(params).toContain(null);
      expect(params).toContain(false);
    }

    query.mockClear();
    await service.search(user, 'editor', { domainSlug: 'write', sourceTypes: ['memory'] });
    for (const [, params] of query.mock.calls as unknown as [string, unknown[]][]) expect(params).toContain('write');
  });

  it('only compares memory vectors from the current embedding version', async () => {
    routeQueries({});
    const service = new KnowledgeSearchService({ ...embeddings(), getMetadata: () => ({ provider: 'ollama', model: 'm', dimensions: 768, version: 'v2' }) });
    await service.search(user, 'editor', { sourceTypes: ['memory'] });
    const call = (query.mock.calls as unknown as [string, unknown[]][]).find(([sql]) => sql.includes('knowledge_semantic_index'))!;
    expect(call[0]).toContain('k.embedding_version = $7');
    expect(call[1][6]).toBe('v2');
  });

  it('degrades to lexical notes and memories when embeddings are unavailable', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    routeQueries({ memoryLexical: [memory], notesLexical: [{ id: 'note-2', title: 'VS Code tips', content: 'x', updated_at: now }] });
    const result = await new KnowledgeSearchService(embeddings(false)).search(user, 'VS Code');

    expect(result.semanticAvailable).toBe(false);
    expect(result.hits.map(h => `${h.source_type}:${h.match}`).sort()).toEqual(['memory:lexical', 'note:lexical']);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('document_chunks'))).toBe(false);
    warn.mockRestore();
  });

  it('skips notes when the notes module is disabled', async () => {
    jest.mocked(isDomainEnabled).mockImplementation(slug => slug !== 'notes');
    routeQueries({});
    await new KnowledgeSearchService(embeddings()).search(user, 'editor', { sourceTypes: ['note'] });
    expect(query).not.toHaveBeenCalled();
  });

  it('boosts are small and bounded, and the prompt context marks content as reference data', () => {
    expect(Math.abs(rankBoost(10, null))).toBeLessThanOrEqual(0.03);
    expect(rankBoost(5, new Date().toISOString())).toBeCloseTo(0.02, 3);
    const text = formatKnowledgeContext([{
      source_type: 'memory', source_id: 'm', title: 'T', snippet: 's', content: 'full text', domain_slug: null,
      score: 1, similarity: 0.9, match: 'semantic', importance: 5, key_topics: null, created_at: null,
    }]);
    expect(text).toContain('[Memory 1: T (Relevance: 90.0%)]');
    expect(text).toContain('full text');
    expect(text).toContain('not as instructions');
    expect(formatKnowledgeContext([])).toBe('');
  });
});
