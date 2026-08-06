import pool from '@/app/clients/db';
import { buildKnowledgeEdges, KnowledgeGraphService } from '@/app/services/knowledge/knowledge-graph.service';
import { KnowledgeNode } from '@/app/services/knowledge/knowledge-graph.types';

jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
const query = pool.query as jest.Mock;

function node(overrides: Partial<KnowledgeNode>): KnowledgeNode {
  return {
    id: 'memory:1', sourceId: '1', type: 'memory', sourceType: 'conversation',
    label: 'Node', summary: 'Summary', domainSlug: 'memory', importance: 5,
    status: null, topics: [], canonicalUrl: null, chunkCount: 0,
    hasEmbeddings: false, createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z', metadata: {}, ...overrides,
  };
}

describe('KnowledgeGraphService', () => {
  beforeEach(() => query.mockReset());

  it('projects memories and crawler documents into typed nodes', async () => {
    query
      .mockResolvedValueOnce({ rows: [{
        id: 'memory-id', conversation_id: 'conversation-id', summary: 'Import rules',
        key_topics: ['duimp'], importance_score: 8, domain_slug: 'memory',
        emotion: null, created_at: '2026-08-04T00:00:00.000Z',
      }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'document-id', filename: 'Duimp', domain_slug: 'memory',
        status: 'completed', metadata: {}, uploaded_at: '2026-08-05T00:00:00.000Z',
        source_id: 'receita-federal-duimp', canonical_url: 'https://example.test/duimp',
        attribution: { publisher: 'Receita Federal' }, chunk_count: 2,
        has_embeddings: true, first_chunk: 'DUIMP document content.',
      }] });

    const graph = await new KnowledgeGraphService().getGraph('user-id');

    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'memory:memory-id', type: 'memory', sourceType: 'conversation' }),
      expect.objectContaining({
        id: 'document:document-id', type: 'document', sourceType: 'crawler',
        chunkCount: 2, hasEmbeddings: true, canonicalUrl: 'https://example.test/duimp',
      }),
    ]));
    expect(query.mock.calls[1][0]).toContain("d.status = 'completed'");
    expect(query.mock.calls[1][1]).toEqual(['user-id', null, 200, false]);
    expect(query.mock.calls[1][0]).toContain('user_domain_access');
  });

  it('builds explainable deterministic edges', () => {
    const edges = buildKnowledgeEdges([
      node({ id: 'memory:1', topics: ['duimp'] }),
      node({ id: 'memory:2', sourceId: '2', topics: ['duimp'] }),
      node({ id: 'document:3', sourceId: '3', type: 'document', sourceType: 'crawler' }),
    ]);
    expect(edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        relation: 'shared_topic', provenance: 'deterministic', reason: 'Shared topic: duimp',
      }),
      expect.objectContaining({ relation: 'same_domain', reason: 'Same domain: memory' }),
    ]));
  });

  it('caps and applies domain filtering to both source queries', async () => {
    query.mockResolvedValue({ rows: [] });
    await new KnowledgeGraphService().getGraph('user-id', { domainSlug: 'memory', limit: 900 });
    expect(query.mock.calls[0][1]).toEqual(['user-id', 'memory', 500, false]);
    expect(query.mock.calls[1][1]).toEqual(['user-id', 'memory', 500, false]);
  });
});
