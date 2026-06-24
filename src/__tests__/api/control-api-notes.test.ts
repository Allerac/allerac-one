/** @jest-environment node */

import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { GET as listNotes, POST as createNote } from '@/app/api/v1/notes/route';
import { GET as searchNotes } from '@/app/api/v1/notes/search/route';
import { GET as listNoteTags } from '@/app/api/v1/notes/tags/route';
import { PATCH as updateNote, DELETE as deleteNote } from '@/app/api/v1/notes/[id]/route';

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

jest.mock('@/app/services/notes/notes.service', () => {
  // Store on global so tests can access the singleton created at route module load time
  const service = {
    listNotes: jest.fn(),
    createNote: jest.fn(),
    updateNote: jest.fn(),
    deleteNote: jest.fn(),
    searchNotes: jest.fn(),
    keywordSearchNotes: jest.fn(),
    getAllTags: jest.fn(),
  };
  (global as any).__notesSvc = service;
  return { NotesService: jest.fn().mockImplementation(() => service) };
});

jest.mock('@/app/services/user/user-settings.service', () => ({
  UserSettingsService: jest.fn().mockImplementation(() => ({
    loadUserSettings: jest.fn().mockResolvedValue(null),
  })),
}));

jest.mock('@/app/services/system/system-settings.service', () => ({
  SystemSettingsService: jest.fn().mockImplementation(() => ({
    loadAll: jest.fn().mockResolvedValue({ github_token: null }),
  })),
}));

const mockRequireCurrentUser = jest.mocked(requireCurrentUser);

// resolveNotesToken falls through to process.env.GITHUB_TOKEN when settings return null.
// Clear the env var so tests that expect a null token work correctly.
let savedGithubToken: string | undefined;
beforeAll(() => {
  savedGithubToken = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
});
afterAll(() => {
  process.env.GITHUB_TOKEN = savedGithubToken;
});

function notesSvc() {
  return (global as any).__notesSvc as {
    listNotes: jest.Mock;
    createNote: jest.Mock;
    updateNote: jest.Mock;
    deleteNote: jest.Mock;
    searchNotes: jest.Mock;
    keywordSearchNotes: jest.Mock;
    getAllTags: jest.Mock;
  };
}

const user = {
  id: 'user-id',
  email: 'user@example.com',
  name: 'User',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

const note = {
  id: 'note-id',
  user_id: 'user-id',
  document_id: null,
  title: 'Test note',
  content: 'Note content',
  tags: ['api', 'test'],
  source: 'api',
  due_date: null,
  created_at: new Date('2026-06-25T10:00:00.000Z'),
  updated_at: new Date('2026-06-25T10:00:00.000Z'),
};

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function routeParams(id = 'note-id') {
  return { params: Promise.resolve({ id }) };
}

describe('Control API v1 notes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue(user);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());

    const response = await listNotes(new Request('http://localhost/api/v1/notes'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: 'unauthorized', message: 'Unauthorized' } });
  });

  it('lists notes with optional filters', async () => {
    notesSvc().listNotes.mockResolvedValueOnce([note]);

    const response = await listNotes(new Request('http://localhost/api/v1/notes?tag=api&limit=10'));

    expect(response.status).toBe(200);
    expect(notesSvc().listNotes).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({ tag: 'api', limit: 10 }),
    );
    const body = await response.json();
    expect(body.data.notes[0]).toMatchObject({ id: 'note-id', title: 'Test note', content: 'Note content' });
  });

  it('validates missing content on create', async () => {
    const response = await createNote(jsonRequest('http://localhost/api/v1/notes', 'POST', { title: 'No content' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
    expect(notesSvc().createNote).not.toHaveBeenCalled();
  });

  it('creates a note with source api', async () => {
    notesSvc().createNote.mockResolvedValueOnce(note);

    const response = await createNote(jsonRequest('http://localhost/api/v1/notes', 'POST', {
      content: 'Note content',
      title: 'Test note',
      tags: ['api'],
    }));

    expect(response.status).toBe(201);
    expect(notesSvc().createNote).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({ content: 'Note content', source: 'api' }),
      null,
    );
    const body = await response.json();
    expect(body.data.note).toMatchObject({ id: 'note-id' });
  });

  it('searches notes using keyword fallback when no token', async () => {
    notesSvc().keywordSearchNotes.mockResolvedValueOnce([note]);

    const response = await searchNotes(new Request('http://localhost/api/v1/notes/search?q=test'));

    expect(response.status).toBe(200);
    expect(notesSvc().keywordSearchNotes).toHaveBeenCalledWith(user.id, 'test');
    const body = await response.json();
    expect(body.data.results[0]).toMatchObject({ id: 'note-id', similarity: 0 });
  });

  it('returns 400 when search query is missing', async () => {
    const response = await searchNotes(new Request('http://localhost/api/v1/notes/search'));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
  });

  it('returns all tags', async () => {
    notesSvc().getAllTags.mockResolvedValueOnce(['api', 'test', 'todo']);

    const response = await listNoteTags(new Request('http://localhost/api/v1/notes/tags'));

    expect(response.status).toBe(200);
    expect(notesSvc().getAllTags).toHaveBeenCalledWith(user.id);
    const body = await response.json();
    expect(body.data.tags).toEqual(['api', 'test', 'todo']);
  });

  it('updates note tags', async () => {
    const updated = { ...note, tags: ['api', 'done'] };
    notesSvc().updateNote.mockResolvedValueOnce(updated);

    const response = await updateNote(
      jsonRequest('http://localhost/api/v1/notes/note-id', 'PATCH', { tags: ['api', 'done'] }),
      routeParams(),
    );

    expect(response.status).toBe(200);
    expect(notesSvc().updateNote).toHaveBeenCalledWith(user.id, 'note-id', { tags: ['api', 'done'] });
    const body = await response.json();
    expect(body.data.note.tags).toEqual(['api', 'done']);
  });

  it('returns 404 when note not found on update', async () => {
    notesSvc().updateNote.mockResolvedValueOnce(null);

    const response = await updateNote(
      jsonRequest('http://localhost/api/v1/notes/missing', 'PATCH', { content: 'updated' }),
      routeParams('missing'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('deletes a note', async () => {
    notesSvc().deleteNote.mockResolvedValueOnce(true);

    const response = await deleteNote(
      new Request('http://localhost/api/v1/notes/note-id', { method: 'DELETE' }),
      routeParams(),
    );

    expect(response.status).toBe(200);
    expect(notesSvc().deleteNote).toHaveBeenCalledWith(user.id, 'note-id');
    expect(await response.json()).toEqual({ data: { deleted: true } });
  });

  it('returns 404 when note not found on delete', async () => {
    notesSvc().deleteNote.mockResolvedValueOnce(false);

    const response = await deleteNote(
      new Request('http://localhost/api/v1/notes/missing', { method: 'DELETE' }),
      routeParams('missing'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
  });
});
