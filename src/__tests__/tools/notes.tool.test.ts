const updateNote = jest.fn();

jest.mock('@/app/services/notes/notes.service', () => ({
  NotesService: jest.fn().mockImplementation(() => ({ updateNote })),
}));

import { buildNotesTools } from '@/app/tools/notes.tool';

describe('update_note tool', () => {
  beforeEach(() => {
    updateNote.mockReset();
    updateNote.mockResolvedValue({ id: 'note-1' });
  });

  test('passes due_date through to the service', async () => {
    await buildNotesTools({ id: 'user-1' }).update_note({ note_id: 'note-1', due_date: '2026-10-20' });
    expect(updateNote).toHaveBeenCalledWith('user-1', 'note-1', expect.objectContaining({ due_date: '2026-10-20' }));
  });

  test('null or empty due_date clears it', async () => {
    const tools = buildNotesTools({ id: 'user-1' });
    await tools.update_note({ note_id: 'note-1', due_date: null });
    await tools.update_note({ note_id: 'note-1', due_date: '' });
    expect(updateNote.mock.calls[0][2].due_date).toBeNull();
    expect(updateNote.mock.calls[1][2].due_date).toBeNull();
  });

  test('omitted due_date keeps the current value', async () => {
    await buildNotesTools({ id: 'user-1' }).update_note({ note_id: 'note-1', title: 'New' });
    expect(updateNote.mock.calls[0][2].due_date).toBeUndefined();
  });
});
