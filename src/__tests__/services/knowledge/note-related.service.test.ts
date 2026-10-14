import pool from '@/app/clients/db';
import { NoteRelatedService, RELATED_MIN_SIMILARITY } from '@/app/services/knowledge/note-related.service';

jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
const query = pool.query as jest.Mock;

function route(note: Record<string, unknown> | null, rows: { notes?: unknown[]; documents?: unknown[]; memories?: unknown[] } = {}) {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('AS has_vector')) return { rows: note ? [note] : [] };
    if (sql.includes("d.source_type = 'note'")) return { rows: rows.notes ?? [] };
    if (sql.includes("d.source_type <> 'note'")) return { rows: rows.documents ?? [] };
    if (sql.includes('FROM conversation_summaries')) return { rows: rows.memories ?? [] };
    throw new Error(`unexpected SQL: ${sql}`);
  });
}

const sqlOf = (needle: string) => query.mock.calls.find(c => String(c[0]).includes(needle));

describe('NoteRelatedService', () => {
  const svc = new NoteRelatedService();
  beforeEach(() => query.mockReset());

  it('returns null for a note the user does not own', async () => {
    route(null);
    expect(await svc.getRelated('u1', 'other')).toBeNull();
    expect(query.mock.calls[0][1]).toEqual(['other', 'u1']);
  });

  it('ranks notes and documents by similarity to the note vector', async () => {
    route({ id: 'n1', title: 'Roadmap', tags: ['Plan'], has_vector: true }, {
      notes: [{ note_id: 'n2', similarity: 0.8 }], documents: [{ document_id: 'd1', similarity: 0.6 }],
      memories: [{ memory_id: 'm1', reason: 'shared_topic' }],
    });
    const res = await svc.getRelated('u1', 'n1', { limit: 3 });
    expect(res).toEqual({
      semanticAvailable: true,
      notes: [{ note_id: 'n2', similarity: 0.8 }],
      documents: [{ document_id: 'd1', similarity: 0.6 }],
      memories: [{ memory_id: 'm1', reason: 'shared_topic' }],
    });
    const notesCall = sqlOf("d.source_type = 'note'")!;
    expect(notesCall[0]).toContain('AVG(dc.embedding)');
    expect(notesCall[0]).toContain('n.archived_at IS NULL');
    expect(notesCall[0]).toContain('n.id <> $2');
    expect(notesCall[1]).toEqual(['u1', 'n1', 3, RELATED_MIN_SIMILARITY]);
    const docsCall = sqlOf("d.source_type <> 'note'")!;
    expect(docsCall[0]).toContain('user_domain_access');
    expect(docsCall[1]).toEqual(['u1', 'n1', 3, RELATED_MIN_SIMILARITY, false]);
  });

  it('skips vector queries when the note has no embeddings', async () => {
    route({ id: 'n1', title: 'Roadmap', tags: [], has_vector: false });
    const res = await svc.getRelated('u1', 'n1');
    expect(res?.semanticAvailable).toBe(false);
    expect(sqlOf('AVG(dc.embedding)')).toBeUndefined();
  });

  it('matches memories by tags, title and derived_from, with domain access', async () => {
    route({ id: 'n1', title: '50%_off plan', tags: [' Plan ', 'plan', ''], has_vector: false });
    await svc.getRelated('u1', 'n1', { isAdmin: true });
    const [sql, params] = sqlOf('FROM conversation_summaries')!;
    expect(sql).toContain("l.relation = 'derived_from'");
    expect(sql).toContain('user_domain_access');
    expect(params).toEqual(['u1', 'n1', ['plan'], '%50\\%\\_off plan%', 5, true]);
  });

  it('does not use very short titles for memory matching', async () => {
    route({ id: 'n1', title: 'Hi', tags: [], has_vector: false });
    await svc.getRelated('u1', 'n1');
    expect(sqlOf('FROM conversation_summaries')![1][3]).toBeNull();
  });

  it('never queries tickets and caps the limit', async () => {
    route({ id: 'n1', title: 'Roadmap', tags: [], has_vector: true });
    await svc.getRelated('u1', 'n1', { limit: 999 });
    expect(query.mock.calls.every(c => !/ticket/i.test(String(c[0])))).toBe(true);
    expect(sqlOf("d.source_type = 'note'")![1][2]).toBe(20);
  });
});
