import '../../__mocks__/db';
import pool from '@/app/clients/db';
import { NotesService } from '@/app/services/notes/notes.service';

const mockQuery = jest.mocked(pool.query);

describe('NotesService ownership', () => {
  let notesService: NotesService;

  beforeEach(() => {
    jest.clearAllMocks();
    notesService = new NotesService();
  });

  it('does not delete a note that is not owned by the user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const deleted = await notesService.deleteNote('user-a', 'note-b');

    expect(deleted).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT document_id FROM user_notes WHERE id = $1 AND user_id = $2',
      ['note-b', 'user-a']
    );
  });

  it('scopes note and linked document deletion to the user', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ document_id: 'doc-a' }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    const deleted = await notesService.deleteNote('user-a', 'note-a');

    expect(deleted).toBe(true);
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM user_notes WHERE id = $1 AND user_id = $2',
      ['note-a', 'user-a']
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      3,
      'DELETE FROM documents WHERE id = $1 AND uploaded_by = $2',
      ['doc-a', 'user-a']
    );
  });

  it('scopes note updates to the user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const note = await notesService.updateNote('user-a', 'note-b', { title: 'Updated' });

    expect(note).toBeNull();
    expect(mockQuery.mock.calls[0][0]).toContain('AND user_id = $3');
    expect(mockQuery.mock.calls[0][1]).toEqual(['Updated', 'note-b', 'user-a']);
  });
});
