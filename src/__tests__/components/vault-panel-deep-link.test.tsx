import { render, screen, waitFor } from '@testing-library/react';
import VaultPanel from '@/app/notes/VaultPanel';
import * as noteActions from '@/app/actions/notes';

jest.mock('react-markdown', () => ({ __esModule: true, default: ({ children }: { children: string }) => <div>{children}</div> }));
jest.mock('remark-gfm', () => ({ __esModule: true, default: () => undefined }));
jest.mock('@/app/actions/notes', () => ({
  listNotes: jest.fn().mockResolvedValue({ success: true, notes: [] }),
  searchNotes: jest.fn(),
  createNote: jest.fn(),
  updateNote: jest.fn(),
  deleteNote: jest.fn(),
  getAllTags: jest.fn().mockResolvedValue({ success: true, tags: [] }),
  listNoteTree: jest.fn().mockResolvedValue({ success: true, items: [] }),
  getNote: jest.fn(),
  moveNote: jest.fn(),
  setNoteArchived: jest.fn(),
  getNoteBreadcrumbs: jest.fn().mockResolvedValue({ success: true, breadcrumbs: [] }),
  getNoteBacklinks: jest.fn().mockResolvedValue({ success: true, backlinks: [] }),
}));

const note = {
  id: 'n1', title: 'Linked page', content: 'Body', tags: [], source: 'manual', due_date: null,
  parent_id: null, archived_at: null, created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z',
};

describe('VaultPanel deep link', () => {
  afterEach(() => window.history.pushState({}, '', '/'));

  it('opens the page given by ?note= (from the Knowledge graph)', async () => {
    jest.mocked(noteActions.getNote).mockResolvedValue({ success: true, note } as never);
    window.history.pushState({}, '', '/notes?note=n1');
    const onEditorToggle = jest.fn();
    render(<VaultPanel userId="u1" isDarkMode={false} onEditorToggle={onEditorToggle} />);
    await waitFor(() => expect(screen.getByDisplayValue('Linked page')).toBeTruthy());
    expect(noteActions.getNote).toHaveBeenCalledWith('n1');
    expect(onEditorToggle).toHaveBeenCalledWith(true);
  });

  it('does nothing without ?note=', async () => {
    jest.mocked(noteActions.getNote).mockClear();
    render(<VaultPanel userId="u1" isDarkMode={false} />);
    await waitFor(() => expect(noteActions.listNotes).toHaveBeenCalled());
    expect(noteActions.getNote).not.toHaveBeenCalled();
  });
});
