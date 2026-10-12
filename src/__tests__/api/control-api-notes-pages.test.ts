/** @jest-environment node */

import { assertDomainAccess, ForbiddenError, requireCurrentUser } from '@/app/lib/auth-session';
import { apiKeyService } from '@/app/services/api-keys/api-key.service';
import { GET as listNotes, POST as createNote } from '@/app/api/v1/notes/route';
import { GET as getNote, PATCH as updateNote } from '@/app/api/v1/notes/[id]/route';
import { NoteMoveError } from '@/app/services/notes/note-pages.service';

jest.mock('@/app/lib/auth-session', () => {
  class MockUnauthorizedError extends Error {}
  class MockForbiddenError extends Error {}
  return {
    UnauthorizedError: MockUnauthorizedError,
    ForbiddenError: MockForbiddenError,
    requireCurrentUser: jest.fn(),
    assertDomainAccess: jest.fn(),
  };
});

jest.mock('@/app/services/api-keys/api-key.service', () => ({
  ...jest.requireActual('@/app/services/api-keys/api-key.service'),
  apiKeyService: { validateBearerToken: jest.fn() },
}));

jest.mock('@/app/services/notes/notes.service', () => {
  const service = { listNotes: jest.fn(), createNote: jest.fn(), updateNote: jest.fn(), getNote: jest.fn() };
  (globalThis as Record<string, unknown>).__pageNotesSvc = service;
  return { NotesService: jest.fn().mockImplementation(() => service) };
});

jest.mock('@/app/services/notes/note-pages.service', () => {
  const actual = jest.requireActual('@/app/services/notes/note-pages.service');
  const service = { listChildren: jest.fn(), getBreadcrumbs: jest.fn(), moveNote: jest.fn(), setArchived: jest.fn() };
  (globalThis as Record<string, unknown>).__pagesSvc = service;
  return { NoteMoveError: actual.NoteMoveError, NotePagesService: jest.fn().mockImplementation(() => service) };
});

const notesSvc = () => (globalThis as Record<string, unknown>).__pageNotesSvc as Record<string, jest.Mock>;
const pagesSvc = () => (globalThis as Record<string, unknown>).__pagesSvc as Record<string, jest.Mock>;
const PARENT = '11111111-1111-4111-8111-111111111111';
const user = { id: 'user-id', email: 'u@example.com', name: 'U', is_admin: false, created_at: new Date() };
const note = (over: Record<string, unknown> = {}) => ({
  id: 'note-id', user_id: 'user-id', document_id: null, title: 'T', content: 'C', tags: [], source: 'api',
  due_date: null, parent_id: null, position: 0, icon: null, archived_at: null,
  created_at: new Date('2026-06-25T10:00:00.000Z'), updated_at: new Date('2026-06-25T10:00:00.000Z'), ...over,
});
const json = (url: string, method: string, body: unknown) =>
  new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const params = (id = 'note-id') => ({ params: Promise.resolve({ id }) });

describe('Control API v1 note pages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(requireCurrentUser).mockResolvedValue(user as never);
    jest.mocked(assertDomainAccess).mockResolvedValue(undefined);
  });

  it('enforces notes domain access', async () => {
    jest.mocked(assertDomainAccess).mockRejectedValueOnce(new ForbiddenError('Domain access denied'));
    const res = await listNotes(new Request('http://localhost/api/v1/notes'));
    expect(res.status).toBe(403);
    expect(assertDomainAccess).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-id' }), 'notes');
  });

  it('checks the API key scope for reads and writes', async () => {
    jest.mocked(apiKeyService.validateBearerToken).mockResolvedValue(user as never);
    notesSvc().getNote.mockResolvedValue(note());
    pagesSvc().getBreadcrumbs.mockResolvedValue([]);
    pagesSvc().listChildren.mockResolvedValue([]);
    await getNote(new Request('http://localhost/api/v1/notes/note-id', { headers: { Authorization: 'Bearer k' } }), params());
    expect(apiKeyService.validateBearerToken).toHaveBeenLastCalledWith('k', 'notes:read');
    notesSvc().updateNote.mockResolvedValue(note());
    const req = new Request('http://localhost/api/v1/notes/note-id', {
      method: 'PATCH', headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'x' }),
    });
    await updateNote(req, params());
    expect(apiKeyService.validateBearerToken).toHaveBeenLastCalledWith('k', 'notes:write');
  });

  it('lists top-level pages and children by parent_id', async () => {
    pagesSvc().listChildren.mockResolvedValue([note({ parent_id: PARENT })]);
    notesSvc().getNote.mockResolvedValue(note({ id: PARENT }));
    const res = await listNotes(new Request(`http://localhost/api/v1/notes?parent_id=${PARENT}`));
    expect(res.status).toBe(200);
    expect((await res.json()).data.notes[0].parentId).toBe(PARENT);
    expect(pagesSvc().listChildren).toHaveBeenCalledWith('user-id', PARENT, { includeArchived: false, limit: 50 });

    await listNotes(new Request('http://localhost/api/v1/notes?parent_id=root'));
    expect(pagesSvc().listChildren).toHaveBeenLastCalledWith('user-id', null, expect.any(Object));
  });

  it('returns 404 for a foreign parent and 400 for a malformed one', async () => {
    notesSvc().getNote.mockResolvedValue(null);
    expect((await listNotes(new Request(`http://localhost/api/v1/notes?parent_id=${PARENT}`))).status).toBe(404);
    expect((await listNotes(new Request('http://localhost/api/v1/notes?parent_id=nope'))).status).toBe(400);
  });

  it('creates a note under a parent', async () => {
    notesSvc().createNote.mockResolvedValue(note({ parent_id: PARENT }));
    const res = await createNote(json('http://localhost/api/v1/notes', 'POST', { content: 'x', parent_id: PARENT }));
    expect(res.status).toBe(201);
    expect(notesSvc().createNote).toHaveBeenCalledWith('user-id', expect.objectContaining({ parent_id: PARENT }));
  });

  it('maps a missing parent on create to 404', async () => {
    notesSvc().createNote.mockRejectedValue(new NoteMoveError('Parent note not found', 'parent_not_found'));
    const res = await createNote(json('http://localhost/api/v1/notes', 'POST', { content: 'x', parent_id: PARENT }));
    expect(res.status).toBe(404);
  });

  it('returns a note with its path and children', async () => {
    notesSvc().getNote.mockResolvedValue(note({ parent_id: PARENT }));
    pagesSvc().getBreadcrumbs.mockResolvedValue([{ id: PARENT, title: 'P', icon: null }]);
    pagesSvc().listChildren.mockResolvedValue([note({ id: 'child', parent_id: 'note-id' })]);
    const body = await (await getNote(new Request('http://localhost/api/v1/notes/note-id'), params())).json();
    expect(body.data.note.parentId).toBe(PARENT);
    expect(body.data.path).toEqual([{ id: PARENT, title: 'P', icon: null }]);
    expect(body.data.children[0]).toMatchObject({ id: 'child', parentId: 'note-id' });
  });

  it('moves a note via PATCH parent_id and maps cycles to 409', async () => {
    notesSvc().getNote.mockResolvedValue(note());
    pagesSvc().moveNote.mockResolvedValue(note({ parent_id: PARENT }));
    const ok = await updateNote(json('http://localhost/api/v1/notes/note-id', 'PATCH', { parent_id: PARENT }), params());
    expect(ok.status).toBe(200);
    expect(notesSvc().updateNote).not.toHaveBeenCalled();
    expect(pagesSvc().moveNote).toHaveBeenCalledWith('user-id', 'note-id', PARENT, undefined);

    pagesSvc().moveNote.mockRejectedValue(new NoteMoveError('cycle', 'cycle'));
    const bad = await updateNote(json('http://localhost/api/v1/notes/note-id', 'PATCH', { parent_id: PARENT }), params());
    expect(bad.status).toBe(409);
  });

  it('archives via PATCH and rejects empty updates', async () => {
    notesSvc().getNote.mockResolvedValue(note({ archived_at: new Date('2026-07-01T00:00:00.000Z') }));
    const res = await updateNote(json('http://localhost/api/v1/notes/note-id', 'PATCH', { archived: true }), params());
    expect(pagesSvc().setArchived).toHaveBeenCalledWith('user-id', 'note-id', true);
    expect((await res.json()).data.note.archivedAt).toBe('2026-07-01T00:00:00.000Z');
    expect((await updateNote(json('http://localhost/api/v1/notes/note-id', 'PATCH', {}), params())).status).toBe(400);
  });
});
