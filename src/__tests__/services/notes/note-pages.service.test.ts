import '../../__mocks__/db';
import pool from '@/app/clients/db';
import { NotePagesService, NoteMoveError } from '@/app/services/notes/note-pages.service';

const mockConnect = jest.mocked(pool.connect);

type Handler = (sql: string, params: unknown[]) => { rows: unknown[]; rowCount?: number } | undefined;

function fakeClient(handler: Handler) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return handler(sql, params) ?? { rows: [], rowCount: 0 };
    }),
    release: jest.fn(),
  };
  mockConnect.mockResolvedValueOnce(client as never);
  return { client, calls };
}

/** In-memory tree: id -> parent_id. */
function treeHandler(tree: Record<string, string | null>): Handler {
  return (sql, params) => {
    if (sql.startsWith('SELECT id FROM user_notes WHERE id = $1')) {
      return { rows: params[0] as string in tree ? [{ id: params[0] }] : [] };
    }
    if (sql.includes('WITH RECURSIVE chain')) {
      const [start, , target] = params as string[];
      let cur: string | null = start;
      const seen = new Set<string>();
      while (cur && !seen.has(cur)) {
        if (cur === target) return { rows: [{ '?column?': 1 }] };
        seen.add(cur);
        cur = tree[cur] ?? null;
      }
      return { rows: [] };
    }
    if (sql.includes('COALESCE(MAX(position)')) return { rows: [{ next: 3 }] };
    if (sql.startsWith('UPDATE user_notes SET parent_id')) {
      return { rows: [{ id: params[2], parent_id: params[0], position: params[1] }], rowCount: 1 };
    }
    return undefined;
  };
}

describe('NotePagesService.moveNote', () => {
  const service = new NotePagesService();
  // root -> a -> b -> c ; d is a separate root
  const tree = { a: null, b: 'a', c: 'b', d: null };

  beforeEach(() => jest.clearAllMocks());

  it('moves a note under another parent and appends it', async () => {
    const { client, calls } = fakeClient(treeHandler(tree));
    const note = await service.moveNote('u1', 'd', 'c');
    expect(note).toMatchObject({ id: 'd', parent_id: 'c', position: 3 });
    expect(calls[0].sql).toBe('BEGIN');
    expect(calls[1].sql).toContain('pg_advisory_xact_lock');
    expect(calls.at(-1)?.sql).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('rejects moving a note under its own descendant', async () => {
    const { calls, client } = fakeClient(treeHandler(tree));
    await expect(service.moveNote('u1', 'a', 'c')).rejects.toMatchObject({ code: 'cycle' });
    expect(calls.some(c => c.sql === 'ROLLBACK')).toBe(true);
    expect(calls.some(c => c.sql.startsWith('UPDATE user_notes SET parent_id'))).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });

  it('rejects a note as its own parent', async () => {
    fakeClient(treeHandler(tree));
    await expect(service.moveNote('u1', 'b', 'b')).rejects.toBeInstanceOf(NoteMoveError);
  });

  it('rejects parents the user does not own', async () => {
    fakeClient(treeHandler(tree));
    await expect(service.moveNote('u1', 'b', 'other-users-note')).rejects.toMatchObject({ code: 'parent_not_found' });
  });

  it('rejects unknown notes', async () => {
    fakeClient(treeHandler(tree));
    await expect(service.moveNote('u1', 'zzz', null)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('moves to the root at an explicit position and shifts siblings', async () => {
    const { calls } = fakeClient(treeHandler(tree));
    const note = await service.moveNote('u1', 'c', null, 0);
    expect(note).toMatchObject({ parent_id: null, position: 0 });
    const shift = calls.find(c => c.sql.includes('position = position + 1'));
    expect(shift?.params).toEqual(['u1', null, 'c', 0]);
  });
});

describe('NotePagesService tree queries', () => {
  const service = new NotePagesService();
  const mockQuery = jest.mocked(pool.query);
  beforeEach(() => jest.clearAllMocks());

  it('archives a whole subtree scoped to the user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 3 } as never);
    expect(await service.setArchived('u1', 'a', true)).toBe(3);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WITH RECURSIVE subtree');
    expect(sql).toContain('COALESCE(archived_at, NOW())');
    expect(params).toEqual(['a', 'u1']);
  });

  it('unarchives by clearing archived_at', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    await service.setArchived('u1', 'a', false);
    expect(mockQuery.mock.calls[0][0]).toContain('SET archived_at = NULL');
  });

  it('hides archived notes from the tree by default', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    await service.listTree('u1');
    expect(mockQuery.mock.calls[0][0]).toContain('archived_at IS NULL');
    await service.listTree('u1', { includeArchived: true });
    expect(mockQuery.mock.calls[1][0]).not.toContain('archived_at IS NULL');
  });

  it('returns breadcrumbs root-first without the note itself', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a' }, { id: 'b' }] } as never);
    expect(await service.getBreadcrumbs('u1', 'c')).toEqual([{ id: 'a' }, { id: 'b' }]);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('depth > 0');
    expect(sql).toContain('ORDER BY depth DESC');
  });
});
