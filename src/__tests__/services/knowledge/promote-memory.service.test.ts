import pool from '@/app/clients/db';
import { assertDomainAccess } from '@/app/lib/domain-access-check';
import { PromoteMemoryService, titleFromMemory } from '@/app/services/knowledge/promote-memory.service';

jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('@/app/lib/domain-access-check', () => ({ assertDomainAccess: jest.fn() }));
const createNote = jest.fn();
jest.mock('@/app/services/notes/notes.service', () => ({
  NotesService: jest.fn().mockImplementation(() => ({ createNote })),
}));

const query = pool.query as jest.Mock;
const user = { id: 'u1', is_admin: false };
const memory = { id: 'm1', summary: 'User prefers Postgres. They run a mini PC.', key_topics: ['DB', 'db', ' infra '], domain_slug: 'chat' };

function route(opts: { memory?: unknown; existing?: unknown[] } = {}) {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM conversation_summaries')) return { rows: opts.memory === undefined ? [memory] : (opts.memory ? [opts.memory] : []) };
    if (sql.includes('FROM knowledge_links l')) return { rows: opts.existing ?? [] };
    if (sql.startsWith('INSERT INTO knowledge_links')) return { rows: [], rowCount: 1 };
    throw new Error(sql);
  });
}

describe('PromoteMemoryService', () => {
  const svc = new PromoteMemoryService();
  beforeEach(() => {
    jest.clearAllMocks();
    createNote.mockResolvedValue({ id: 'n1', title: 'User prefers Postgres.' });
  });

  it('creates a page from the memory, keeps the memory and links back', async () => {
    route();
    const res = await svc.promote(user, 'm1', { parentId: 'p1' });
    expect(res).toEqual({ note: { id: 'n1', title: 'User prefers Postgres.' }, alreadyPromoted: false });
    expect(createNote).toHaveBeenCalledWith('u1', {
      title: 'User prefers Postgres.', content: memory.summary, tags: ['db', 'infra'], source: 'memory', parent_id: 'p1',
    });
    const insert = query.mock.calls.find(c => String(c[0]).startsWith('INSERT INTO knowledge_links'))!;
    expect(insert[0]).toContain("'note', $2, 'memory', $3, 'derived_from'");
    expect(insert[1]).toEqual(['u1', 'n1', 'm1']);
    expect(query.mock.calls.some(c => /DELETE|UPDATE conversation_summaries/.test(String(c[0])))).toBe(false);
  });

  it('checks access to the memory domain', async () => {
    route();
    jest.mocked(assertDomainAccess).mockRejectedValueOnce(new Error('Domain access denied'));
    await expect(svc.promote(user, 'm1')).rejects.toThrow('Domain access denied');
    expect(assertDomainAccess).toHaveBeenCalledWith(user, 'chat');
    expect(createNote).not.toHaveBeenCalled();
  });

  it('returns the existing page when already promoted', async () => {
    route({ existing: [{ id: 'n0' }] });
    expect(await svc.promote(user, 'm1')).toEqual({ note: { id: 'n0' }, alreadyPromoted: true });
    expect(createNote).not.toHaveBeenCalled();
  });

  it('rejects memories the user does not own', async () => {
    route({ memory: null });
    await expect(svc.promote(user, 'mX')).rejects.toMatchObject({ code: 'not_found' });
    expect(query.mock.calls[0][1]).toEqual(['mX', 'u1']);
  });

  it('uses a custom title when given', async () => {
    route({ memory: { ...memory, domain_slug: null } });
    await svc.promote(user, 'm1', { title: '  My page ' });
    expect(createNote.mock.calls[0][1].title).toBe('My page');
    expect(assertDomainAccess).not.toHaveBeenCalled();
  });
});

describe('titleFromMemory', () => {
  it('takes the first sentence and trims long text on a word boundary', () => {
    expect(titleFromMemory('First. Second.')).toBe('First.');
    expect(titleFromMemory('line one\nline two')).toBe('line one');
    const long = 'word '.repeat(40);
    const t = titleFromMemory(long);
    expect(t.length).toBeLessThanOrEqual(80);
    expect(t.endsWith('…')).toBe(true);
    expect(titleFromMemory('   ')).toBe('Memory');
  });
});
