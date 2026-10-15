jest.mock('@/app/clients/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

jest.mock('@/app/lib/domain-access-check', () => ({
  assertDomainAccess: jest.fn(),
}));

const knowledgeSearch = jest.fn();
jest.mock('@/app/services/knowledge/knowledge-search.service', () => ({
  ...jest.requireActual('@/app/services/knowledge/knowledge-search.service'),
  getKnowledgeSearchService: () => ({ search: knowledgeSearch }),
}));

import pool from '@/app/clients/db';
import { assertDomainAccess } from '@/app/lib/domain-access-check';
import { buildMemoryTools } from '@/app/tools/memory.tool';
import type { User } from '@/app/services/auth/auth.service';

const query = jest.mocked(pool.query);
const assertAccess = jest.mocked(assertDomainAccess);
const user: User = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'User',
  is_admin: false,
  created_at: new Date(),
};

describe('memory tools', () => {
  beforeEach(() => {
    query.mockReset();
    assertAccess.mockReset();
    knowledgeSearch.mockReset();
    delete process.env.KNOWLEDGE_UNIFIED_RECALL;
  });

  afterAll(() => {
    delete process.env.KNOWLEDGE_UNIFIED_RECALL;
  });

  const memoryHit = {
    source_type: 'memory', source_id: 'memory-1', title: 'Gian uses VS Code', snippet: 'Gian uses VS Code',
    content: 'Gian uses VS Code', domain_slug: 'write', score: 0.8, similarity: 0.78, match: 'semantic',
    importance: 8, key_topics: ['editor'], created_at: '2026-10-01T00:00:00.000Z',
  };

  test('recall_memory uses the unified semantic search in the caller domain', async () => {
    knowledgeSearch.mockResolvedValueOnce({ semanticAvailable: true, hits: [memoryHit] });
    const tools = buildMemoryTools({ user, conversationId: 'conversation-1', callerDomain: 'write' });

    const result = await tools.recall_memory({ query: 'preferred editor' });

    expect(assertAccess).toHaveBeenCalledWith(user, 'write');
    expect(knowledgeSearch).toHaveBeenCalledWith(user, 'preferred editor', {
      sourceTypes: ['memory'], domainSlug: 'write', limit: 5,
    });
    expect(query).not.toHaveBeenCalled();
    expect(result.memories).toEqual([expect.objectContaining({
      id: 'memory-1', summary: 'Gian uses VS Code', key_topics: ['editor'], importance_score: 8, similarity: 0.78,
    })]);
  });

  test('recall_memory falls back to keyword search when the unified search fails', async () => {
    knowledgeSearch.mockRejectedValueOnce(new Error('index missing'));
    (query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'memory-1', summary: 'Prefers concise answers' }] });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const tools = buildMemoryTools({ user, conversationId: 'conversation-1', callerDomain: 'write' });

    const result = await tools.recall_memory({ query: 'answers' });

    expect(query).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), ['user-1', 'write', '%answers%', 5]);
    expect(result.memories).toHaveLength(1);
    warn.mockRestore();
  });

  test('search_knowledge checks an explicit domain and drops ticket source types', async () => {
    knowledgeSearch.mockResolvedValueOnce({ semanticAvailable: true, hits: [memoryHit] });
    const tools = buildMemoryTools({ user, conversationId: 'conversation-1', callerDomain: 'chat' });

    const result = await tools.search_knowledge({ query: 'editor', domain_slug: 'write', source_types: ['ticket', 'memory'], limit: 99 });

    expect(assertAccess).toHaveBeenCalledWith(user, 'write');
    expect(knowledgeSearch).toHaveBeenCalledWith(user, 'editor', expect.objectContaining({
      sourceTypes: ['ticket', 'memory'], domainSlug: 'write', limit: 25, includeArchived: false,
    }));
    expect(result).toEqual(expect.objectContaining({ semantic_available: true }));
    expect((result as { results: unknown[] }).results).toEqual([expect.objectContaining({ source_type: 'memory', source_id: 'memory-1' })]);
  });

  test('search_knowledge without a domain searches every accessible domain', async () => {
    knowledgeSearch.mockResolvedValueOnce({ semanticAvailable: false, hits: [] });
    const tools = buildMemoryTools({ user, conversationId: 'conversation-1', callerDomain: 'chat' });

    await tools.search_knowledge({ query: 'editor' });

    expect(assertAccess).not.toHaveBeenCalled();
    expect(knowledgeSearch).toHaveBeenCalledWith(user, 'editor', expect.objectContaining({ domainSlug: null, limit: 8 }));
  });

  test('recall_memory defaults to the caller domain and checks access (keyword path, flag off)', async () => {
    process.env.KNOWLEDGE_UNIFIED_RECALL = 'false';
    (query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'memory-1', summary: 'Prefers concise answers' }] });
    const tools = buildMemoryTools({ user, conversationId: 'conversation-1', callerDomain: 'write' });

    const result = await tools.recall_memory({ query: 'answers' });

    expect(assertAccess).toHaveBeenCalledWith(user, 'write');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('domain_slug = $2'), [
      'user-1',
      'write',
      '%answers%',
      5,
    ]);
    expect(result.memories).toHaveLength(1);
  });

  test('delete_memory is scoped to the current user', async () => {
    (query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'memory-1' }], rowCount: 1 });
    const tools = buildMemoryTools({ user, conversationId: 'conversation-1', callerDomain: 'memory' });

    const result = await tools.delete_memory({ memory_id: 'memory-1' });

    expect(query).toHaveBeenCalledWith(expect.stringContaining('user_id = $2'), ['memory-1', 'user-1']);
    expect(result).toEqual({ success: true, memory_id: 'memory-1' });
  });
});
