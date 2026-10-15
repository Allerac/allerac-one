const search = jest.fn();
const legacyContext = jest.fn();

jest.mock('@/app/services/knowledge/knowledge-search.service', () => ({
  ...jest.requireActual('@/app/services/knowledge/knowledge-search.service'),
  getKnowledgeSearchService: () => ({ search }),
}));
jest.mock('@/app/services/rag/embedding.service', () => ({ EmbeddingService: jest.fn() }));
jest.mock('@/app/services/rag/vector-search.service', () => ({
  VectorSearchService: jest.fn().mockImplementation(() => ({ getRelevantContext: legacyContext })),
}));

import { CHAT_RAG_LIMIT, CHAT_RAG_MIN_SIMILARITY, loadChatKnowledgeContext } from '@/app/services/knowledge/chat-knowledge-context';

const hit = {
  source_type: 'memory', source_id: 'mem-1', title: 'Gian uses VS Code', snippet: 'Gian uses VS Code', content: 'Gian uses VS Code',
  domain_slug: 'chat', score: 0.8, similarity: 0.8, match: 'semantic', importance: 7, key_topics: null, created_at: null,
};
const input = { userId: 'user-1', isAdmin: false, query: 'which editor do I use?', domainSlug: 'chat' };

describe('loadChatKnowledgeContext', () => {
  beforeEach(() => {
    search.mockReset();
    legacyContext.mockReset().mockResolvedValue('LEGACY');
    delete process.env.KNOWLEDGE_UNIFIED_RAG;
  });
  afterAll(() => { delete process.env.KNOWLEDGE_UNIFIED_RAG; });

  it('injects unified notes, documents and memories of the conversation domain', async () => {
    search.mockResolvedValue({ semanticAvailable: true, hits: [hit] });
    const context = await loadChatKnowledgeContext(input);
    expect(search).toHaveBeenCalledWith({ id: 'user-1', is_admin: false }, input.query, {
      domainSlug: 'chat', limit: CHAT_RAG_LIMIT, minSimilarity: CHAT_RAG_MIN_SIMILARITY,
    });
    expect(context).toContain('[Memory 1: Gian uses VS Code');
    expect(legacyContext).not.toHaveBeenCalled();
  });

  it('keeps the legacy empty message when nothing matches', async () => {
    search.mockResolvedValue({ semanticAvailable: true, hits: [] });
    expect(await loadChatKnowledgeContext(input)).toBe('No relevant documents found in the knowledge base.');
  });

  it('falls back to document search on failure or without embeddings', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    search.mockRejectedValueOnce(new Error('no index'));
    expect(await loadChatKnowledgeContext(input)).toBe('LEGACY');
    search.mockResolvedValueOnce({ semanticAvailable: false, hits: [hit] });
    expect(await loadChatKnowledgeContext(input)).toBe('LEGACY');
    expect(legacyContext).toHaveBeenCalledWith(input.query, 'user-1', { domainSlug: 'chat' });
    warn.mockRestore();
  });

  it('uses document search only for public domains and when the flag is off', async () => {
    expect(await loadChatKnowledgeContext({ ...input, domainSlug: 'sales', publicDomain: true })).toBe('LEGACY');
    process.env.KNOWLEDGE_UNIFIED_RAG = 'false';
    expect(await loadChatKnowledgeContext(input)).toBe('LEGACY');
    expect(search).not.toHaveBeenCalled();
  });
});
