import pool from '@/app/clients/db';
import { buildKnowledgeEdges, buildNoteEdges, KnowledgeGraphService } from '@/app/services/knowledge/knowledge-graph.service';
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

  it('excludes note-backed documents and keeps domain access checks', async () => {
    query.mockResolvedValue({ rows: [] });

    await new KnowledgeGraphService().getGraph('user-id');

    const documentSql = query.mock.calls[1][0] as string;
    expect(documentSql).toContain("d.source_type <> 'note'");
    expect(documentSql).toContain('user_domain_access');
  });

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
      }] })
      .mockResolvedValueOnce({ rows: [] });

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

  it('does not query notes when filtering another domain', async () => {
    query.mockResolvedValue({ rows: [] });
    await new KnowledgeGraphService().getGraph('user-id', { domainSlug: 'memory' });
    expect(query.mock.calls.some(c => String(c[0]).includes('FROM user_notes'))).toBe(false);
  });
});

describe('KnowledgeGraphService note nodes', () => {
  beforeEach(() => query.mockReset());

  const noteRow = (id: string, over: Record<string, unknown> = {}) => ({
    id, title: `Page ${id}`, content: `Body of ${id}`, tags: [], parent_id: null, icon: null,
    source: 'manual', archived_at: null, created_at: '2026-08-06T00:00:00.000Z',
    updated_at: '2026-08-07T00:00:00.000Z', ...over,
  });

  function mockNotes(notes: unknown[], links: unknown[] = []) {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM user_notes')) return { rows: notes };
      if (sql.includes('FROM knowledge_links')) return { rows: links };
      return { rows: [] };
    });
  }

  it('projects notes from user_notes with access and archive filters', async () => {
    mockNotes([noteRow('a', { tags: ['x'], icon: '📄' })]);
    const graph = await new KnowledgeGraphService().getGraph('user-id');
    expect(graph.nodes).toEqual([expect.objectContaining({
      id: 'note:a', sourceId: 'a', type: 'note', sourceType: 'note', label: 'Page a',
      domainSlug: 'notes', topics: ['x'], metadata: expect.objectContaining({ parentId: null, icon: '📄' }),
    })]);
    const call = query.mock.calls.find(c => String(c[0]).includes('FROM user_notes'))!;
    expect(call[0]).toContain('n.archived_at IS NULL');
    expect(call[0]).toContain("d.slug = 'notes' AND d.is_active = true");
    expect(call[1]).toEqual(['user-id', 200, false, false]);
  });

  it('can include archived notes', async () => {
    mockNotes([noteRow('a', { archived_at: '2026-08-08T00:00:00.000Z' })]);
    const graph = await new KnowledgeGraphService().getGraph('user-id', { includeArchivedNotes: true });
    expect(graph.nodes[0].status).toBe('archived');
    expect(query.mock.calls.find(c => String(c[0]).includes('FROM user_notes'))![1][2]).toBe(true);
  });

  it('uses the first line when a note has no title', async () => {
    mockNotes([noteRow('a', { title: null, content: '\n  hello   world \n more' }), noteRow('b', { title: ' ', content: '' })]);
    const graph = await new KnowledgeGraphService().getGraph('user-id');
    expect(graph.nodes.map(n => n.label).sort()).toEqual(['Untitled', 'hello world more']);
  });

  it('adds user links_to and child_of edges ahead of deterministic ones', async () => {
    mockNotes(
      [noteRow('a'), noteRow('b', { parent_id: 'a' }), noteRow('c')],
      [{ from_id: 'a', to_id: 'c' }, { from_id: 'a', to_id: 'c' }, { from_id: 'c', to_id: 'missing' }],
    );
    const graph = await new KnowledgeGraphService().getGraph('user-id');
    const user = graph.edges.filter(e => e.provenance === 'user');
    expect(user).toEqual([
      expect.objectContaining({ id: 'links_to:note:a:note:c', relation: 'links_to', reason: 'Links to [[Page c]]' }),
      expect.objectContaining({ id: 'child_of:note:b:note:a', relation: 'child_of', reason: 'Sub-page of Page a' }),
    ]);
    expect(graph.edges.indexOf(user[1])).toBe(1);
    // No deterministic duplicate for pairs that are already explicitly linked.
    const deterministicPairs = graph.edges.filter(e => e.provenance === 'deterministic')
      .map(e => [e.sourceNodeId, e.targetNodeId].sort().join('|'));
    expect(deterministicPairs).not.toContain('note:a|note:c');
    expect(deterministicPairs).not.toContain('note:a|note:b');
    const linkCall = query.mock.calls.find(c => String(c[0]).includes('FROM knowledge_links'))!;
    expect(linkCall[0]).toContain("from_type = 'note' AND to_type = 'note'");
    expect(linkCall[1]).toEqual(['user-id', ['a', 'b', 'c']]);
  });

  it('never creates edges for ticket links or to hidden parents', () => {
    const nodes = [
      node({ id: 'note:a', sourceId: 'a', type: 'note', sourceType: 'note', metadata: { parentId: 'archived-parent' } }),
      node({ id: 'note:b', sourceId: 'b', type: 'note', sourceType: 'note', metadata: { parentId: null } }),
    ];
    expect(buildNoteEdges(nodes, [{ from_id: 'a', to_id: 'ticket-1' }])).toEqual([]);
  });

  it('skips the links query with fewer than two notes', async () => {
    mockNotes([noteRow('a')]);
    await new KnowledgeGraphService().getGraph('user-id');
    expect(query.mock.calls.some(c => String(c[0]).includes('FROM knowledge_links'))).toBe(false);
  });
});
