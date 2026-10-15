import '../../__mocks__/db';
import pool from '@/app/clients/db';
import {
  MemoryIndexService,
  STALE_MEMORY_CANDIDATES_SQL,
  buildMemoryIndexText,
  hashMemoryIndexText,
} from '@/app/services/knowledge/memory-index.service';

const query = jest.mocked(pool.query);
const metadata = { provider: 'ollama', model: 'embeddinggemma', dimensions: 768, version: 'ollama:embeddinggemma:v1' };

function fakeEmbeddings(fail = false) {
  return {
    getMetadata: () => metadata,
    generateEmbedding: jest.fn(async () => {
      if (fail) throw new Error('down');
      return { embedding: [0.5, 0.25], tokenCount: 3 };
    }),
  };
}

const memory = { id: 'mem-1', user_id: 'user-1', summary: 'Gian uses VS Code', key_topics: ['editor', 'tools'], domain_slug: 'chat' };

describe('MemoryIndexService', () => {
  beforeEach(() => query.mockReset());

  it('builds the indexed text from the summary and topics', () => {
    expect(buildMemoryIndexText('A', ['x', 'y'])).toBe('A\n\nTopics: x, y');
    expect(buildMemoryIndexText('A', [])).toBe('A');
    expect(buildMemoryIndexText('A', null)).toBe('A');
    expect(hashMemoryIndexText('A')).toHaveLength(64);
  });

  it('embeds a new memory at background priority and upserts one row', async () => {
    query.mockResolvedValueOnce({ rows: [memory] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    const embeddings = fakeEmbeddings();
    const outcome = await new MemoryIndexService(embeddings as never).indexMemory('user-1', 'mem-1');

    expect(outcome).toBe('reindexed');
    expect(embeddings.generateEmbedding).toHaveBeenCalledWith('Gian uses VS Code\n\nTopics: editor, tools', 'document');
    const [sql, params] = query.mock.calls[2] as unknown as [string, unknown[]];
    expect(sql).toContain('INSERT INTO knowledge_semantic_index');
    expect(sql).toContain("'memory'");
    expect(params).toEqual([
      'user-1', 'mem-1', 'Gian uses VS Code\n\nTopics: editor, tools', 'chat', '[0.5,0.25]',
      'ollama', 'embeddinggemma', 'ollama:embeddinggemma:v1', hashMemoryIndexText('Gian uses VS Code\n\nTopics: editor, tools'),
    ]);
  });

  it('skips unchanged memories without calling the embedding backend', async () => {
    const hash = hashMemoryIndexText(buildMemoryIndexText(memory.summary, memory.key_topics));
    query.mockResolvedValueOnce({ rows: [memory] } as never)
      .mockResolvedValueOnce({ rows: [{ content_hash: hash, embedding_version: metadata.version, domain_slug: 'chat' }] } as never);
    const embeddings = fakeEmbeddings();
    expect(await new MemoryIndexService(embeddings as never).indexMemory('user-1', 'mem-1')).toBe('skipped');
    expect(embeddings.generateEmbedding).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('re-embeds when the embedding version changed, and reports failures and missing rows', async () => {
    const hash = hashMemoryIndexText(buildMemoryIndexText(memory.summary, memory.key_topics));
    query.mockResolvedValueOnce({ rows: [memory] } as never)
      .mockResolvedValueOnce({ rows: [{ content_hash: hash, embedding_version: 'old', domain_slug: 'chat' }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    expect(await new MemoryIndexService(fakeEmbeddings() as never).indexMemory('user-1', 'mem-1')).toBe('reindexed');

    query.mockReset();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    query.mockResolvedValueOnce({ rows: [memory] } as never).mockResolvedValueOnce({ rows: [] } as never);
    expect(await new MemoryIndexService(fakeEmbeddings(true) as never).indexMemory('user-1', 'mem-1')).toBe('failed');
    expect(query).toHaveBeenCalledTimes(2);
    warn.mockRestore();

    query.mockReset();
    query.mockResolvedValueOnce({ rows: [] } as never);
    expect(await new MemoryIndexService(fakeEmbeddings() as never).indexMemory('user-1', 'gone')).toBe('missing');
  });

  it('selects missing, stale and other-version rows only from memories', () => {
    expect(STALE_MEMORY_CANDIDATES_SQL).toContain('FROM conversation_summaries cs');
    expect(STALE_MEMORY_CANDIDATES_SQL).toContain('ksi.embedding_version <> $3');
    expect(STALE_MEMORY_CANDIDATES_SQL).toContain('ksi.content_hash <>');
    expect(STALE_MEMORY_CANDIDATES_SQL).not.toMatch(/ticket/i);
  });
});
