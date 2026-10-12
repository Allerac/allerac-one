import '../../__mocks__/db';
import pool from '@/app/clients/db';
import { parseWikiLinks, normalizeLinkTitle, MAX_LINKS_PER_NOTE } from '@/app/services/notes/note-links';
import { NoteLinksService } from '@/app/services/notes/note-links.service';

describe('parseWikiLinks', () => {
  it('extracts unique targets in order, case-insensitively', () => {
    expect(parseWikiLinks('See [[Roadmap]] and [[ Ideas  list ]], again [[roadmap]].')).toEqual(['Roadmap', 'Ideas list']);
  });

  it('uses the target part of [[Page|alias]]', () => {
    expect(parseWikiLinks('[[Project X|the project]]')).toEqual(['Project X']);
  });

  it('ignores links in fenced and inline code', () => {
    const md = 'a `[[Inline]]` b\n```ts\nconst x = "[[Fenced]]";\n```\n[[Real]]';
    expect(parseWikiLinks(md)).toEqual(['Real']);
  });

  it('ignores empty, multi-line and nested brackets', () => {
    expect(parseWikiLinks('[[]] [[  ]] [[a\nb]] [[x[y]]')).toEqual([]);
  });

  it('caps the number of links', () => {
    const md = Array.from({ length: MAX_LINKS_PER_NOTE + 20 }, (_, i) => `[[P${i}]]`).join(' ');
    expect(parseWikiLinks(md)).toHaveLength(MAX_LINKS_PER_NOTE);
  });

  it('normalises titles for matching', () => {
    expect(normalizeLinkTitle('  Foo   Bar ')).toBe('foo bar');
  });
});

describe('NoteLinksService', () => {
  const service = new NoteLinksService();
  const mockConnect = jest.mocked(pool.connect);
  const mockQuery = jest.mocked(pool.query);

  function fakeClient(insertRows: unknown[] = []) {
    const client = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => (sql.startsWith('INSERT') ? { rows: insertRows } : { rows: [] })),
      release: jest.fn(),
    };
    mockConnect.mockResolvedValueOnce(client as never);
    return client;
  }

  beforeEach(() => jest.clearAllMocks());

  it('replaces outgoing note links inside a transaction', async () => {
    const client = fakeClient([{ to_id: 'n2' }]);
    const ids = await service.syncNoteLinks('u1', 'n1', 'Link to [[Target Page]] and [[target page]]');
    expect(ids).toEqual(['n2']);
    const sqls = client.query.mock.calls.map(c => c[0] as string);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[1]).toContain('DELETE FROM knowledge_links');
    expect(sqls[2]).toContain("'note', t.id, 'links_to'");
    expect(sqls[2]).toContain('id <> $2');
    expect(client.query.mock.calls[2][1]).toEqual(['u1', 'n1', ['target page']]);
    expect(sqls[3]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('only clears links when the note has none', async () => {
    const client = fakeClient();
    expect(await service.syncNoteLinks('u1', 'n1', 'no links')).toEqual([]);
    const sqls = client.query.mock.calls.map(c => c[0] as string);
    expect(sqls).toHaveLength(3);
    expect(sqls.some(s => s.startsWith('INSERT'))).toBe(false);
  });

  it('rolls back on failure', async () => {
    const client = {
      query: jest.fn(async (sql: string) => { if (sql.startsWith('DELETE')) throw new Error('boom'); return { rows: [] }; }),
      release: jest.fn(),
    };
    mockConnect.mockResolvedValueOnce(client as never);
    await expect(service.syncNoteLinks('u1', 'n1', '[[A]]')).rejects.toThrow('boom');
    expect(client.query.mock.calls.map(c => c[0])).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('lists backlinks scoped to the user and hides archived sources', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ note_id: 'n1' }] } as never);
    expect(await service.getBacklinks('u1', 'n2')).toEqual([{ note_id: 'n1' }]);
    const [sql, params] = mockQuery.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('l.user_id = $1');
    expect(sql).toContain('n.archived_at IS NULL');
    expect(params).toEqual(['u1', 'n2', 50]);
  });

  it('re-syncs only notes that really reference a renamed title', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { id: 'a', content: 'see [[New Name]]' },
      { id: 'b', content: 'mentions new name in prose, links [[Other]]' },
    ] } as never);
    fakeClient([{ to_id: 'renamed' }]);
    expect(await service.resyncReferencesTo('u1', 'New Name', 'renamed')).toBe(1);
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('deletes links in both directions for a deleted note', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await service.deleteLinksForNote('u1', 'n1');
    expect(mockQuery.mock.calls[0][0]).toContain('from_id = $2) OR (to_type');
  });
});
