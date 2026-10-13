const createNote = jest.fn();
const getNote = jest.fn();
const getBreadcrumbs = jest.fn();
const listChildren = jest.fn();

jest.mock('@/app/services/notes/notes.service', () => ({
  NotesService: jest.fn().mockImplementation(() => ({ createNote, getNote })),
}));
jest.mock('@/app/services/notes/note-pages.service', () => ({
  NotePagesService: jest.fn().mockImplementation(() => ({ getBreadcrumbs, listChildren })),
}));

import { buildNotesTools } from '@/app/tools/notes.tool';
import { NOTES_TOOL_DEFINITIONS } from '@/app/tools/notes.tool.definitions';
import { NOTE_TOOL_NAMES } from '@/app/services/chat/chat-tool-registry';

describe('note page tools', () => {
  beforeEach(() => jest.clearAllMocks());

  test('definitions and registry include the page tools', () => {
    const names = NOTES_TOOL_DEFINITIONS.map(d => d.function.name);
    expect(names).toEqual(expect.arrayContaining(['get_note', 'list_children']));
    expect(NOTE_TOOL_NAMES).toEqual(expect.arrayContaining(['get_note', 'list_children']));
    const save = NOTES_TOOL_DEFINITIONS.find(d => d.function.name === 'save_note')!;
    expect(Object.keys(save.function.parameters.properties)).toContain('parent_id');
  });

  test('save_note passes parent_id through', async () => {
    createNote.mockResolvedValue({ id: 'n2', title: 't', tags: [], due_date: null, parent_id: 'p1' });
    const res = await buildNotesTools({ id: 'u1' }).save_note({ content: 'x', parent_id: 'p1' });
    expect(createNote).toHaveBeenCalledWith('u1', expect.objectContaining({ parent_id: 'p1' }), undefined);
    expect(res.parent_id).toBe('p1');
  });

  test('save_note without parent_id creates a top-level note', async () => {
    createNote.mockResolvedValue({ id: 'n2', title: null, tags: [], due_date: null });
    await buildNotesTools({ id: 'u1' }).save_note({ content: 'x' });
    expect(createNote.mock.calls[0][1].parent_id).toBeNull();
  });

  test('get_note returns content, path and children scoped to the user', async () => {
    getNote.mockResolvedValue({ id: 'n1', title: 'T', content: 'body', tags: [], parent_id: 'p', archived_at: null });
    getBreadcrumbs.mockResolvedValue([{ id: 'p', title: 'Parent' }]);
    listChildren.mockResolvedValue([{ id: 'c', title: 'Child' }]);
    const res = await buildNotesTools({ id: 'u1' }).get_note({ note_id: 'n1' });
    expect(getNote).toHaveBeenCalledWith('u1', 'n1');
    expect(res).toMatchObject({ success: true, note: { content: 'body', parent_id: 'p' }, path: [{ note_id: 'p' }], children: [{ note_id: 'c' }] });
  });

  test('get_note reports missing notes', async () => {
    getNote.mockResolvedValue(null);
    expect(await buildNotesTools({ id: 'u1' }).get_note({ note_id: 'x' })).toEqual({ success: false, error: 'Note not found' });
  });

  test('list_children lists top-level pages and caps the limit', async () => {
    listChildren.mockResolvedValue([{ id: 'a', title: 'A', content: 'x'.repeat(500), tags: [] }]);
    const res = await buildNotesTools({ id: 'u1' }).list_children({ limit: 9999 });
    expect(listChildren).toHaveBeenCalledWith('u1', null, { limit: 200 });
    expect(res.children?.[0].content).toHaveLength(200);
  });

  test('list_children rejects a parent the user does not own', async () => {
    getNote.mockResolvedValue(null);
    const res = await buildNotesTools({ id: 'u1' }).list_children({ parent_id: 'other' });
    expect(res.success).toBe(false);
    expect(listChildren).not.toHaveBeenCalled();
  });
});
