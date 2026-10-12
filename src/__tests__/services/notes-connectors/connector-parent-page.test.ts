import '../../__mocks__/db';
import pool from '@/app/clients/db';

const createNote = jest.fn();
const updateNote = jest.fn();
const ensureProviderRootPage = jest.fn();

jest.mock('@/app/services/notes/notes.service', () => ({
  NotesService: jest.fn().mockImplementation(() => ({ createNote, updateNote })),
}));
jest.mock('@/app/services/notes/note-pages.service', () => ({
  NotePagesService: jest.fn().mockImplementation(() => ({ ensureProviderRootPage })),
}));

import { NotesConnectorItemsService } from '@/app/services/notes-connectors/notes-connector-items.service';

const mockQuery = jest.mocked(pool.query);
const connector = {
  fetchContent: jest.fn().mockResolvedValue({ raw: 'raw', mimeType: 'text/plain' }),
  normalizeToMarkdown: jest.fn().mockReturnValue('# md'),
};
const item = (externalId: string) => ({ externalId, title: externalId, sourceUrl: 'u', parentLabel: 'Folder', modifiedAt: '2026-01-01' });

describe('connector imports under a provider page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    createNote.mockImplementation(async (_u: string, input: { title: string }) => ({ id: `note-${input.title}` }));
  });

  it('creates new imports under one provider page, resolved once per batch', async () => {
    ensureProviderRootPage.mockResolvedValue('drive-root');
    const svc = new NotesConnectorItemsService('google_drive', connector as never);
    const res = await svc.importSelected('u1', 'cred', 'token', [item('a'), item('b')]);
    expect(res.imported).toBe(2);
    expect(ensureProviderRootPage).toHaveBeenCalledTimes(1);
    expect(ensureProviderRootPage).toHaveBeenCalledWith('u1', 'google_drive', 'Google Drive');
    expect(createNote.mock.calls.map(c => c[1].parent_id)).toEqual(['drive-root', 'drive-root']);
  });

  it('does not create a provider page when only existing items are updated', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ note_id: 'n1' }], rowCount: 1 } as never);
    const svc = new NotesConnectorItemsService('onenote', connector as never);
    const res = await svc.importSelected('u1', 'cred', 'token', [item('a')]);
    expect(res.updated).toBe(1);
    expect(ensureProviderRootPage).not.toHaveBeenCalled();
  });

  it('falls back to the top level if the provider page cannot be prepared', async () => {
    ensureProviderRootPage.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const svc = new NotesConnectorItemsService('onenote', connector as never);
    await svc.importSelected('u1', 'cred', 'token', [item('a')]);
    expect(createNote.mock.calls[0][1].parent_id).toBeNull();
  });
});
