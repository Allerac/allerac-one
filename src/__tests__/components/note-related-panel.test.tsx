import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NoteRelatedPanel } from '@/app/notes/NoteRelatedPanel';
import * as noteActions from '@/app/actions/notes';

jest.mock('@/app/actions/notes', () => ({
  getNoteRelated: jest.fn(),
  promoteMemoryToPage: jest.fn(),
}));

const related = {
  semanticAvailable: true,
  notes: [{ note_id: 'n2', title: 'Similar page', icon: null, snippet: '', similarity: 0.82 }],
  documents: [{ document_id: 'd1', filename: 'spec.pdf', domain_slug: null, similarity: 0.5 }],
  memories: [
    { memory_id: 'm1', summary: 'User likes Postgres', key_topics: [], domain_slug: null, created_at: new Date(), reason: 'shared_topic' },
    { memory_id: 'm0', summary: 'Origin memory', key_topics: [], domain_slug: null, created_at: new Date(), reason: 'derived_from' },
  ],
};

describe('NoteRelatedPanel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists related pages, documents and memories', async () => {
    jest.mocked(noteActions.getNoteRelated).mockResolvedValue({ success: true, related } as never);
    const onOpenNote = jest.fn();
    render(<NoteRelatedPanel noteId="n1" onOpenNote={onOpenNote} d={false} />);
    await waitFor(() => expect(screen.getByText('Similar page')).toBeTruthy());
    expect(screen.getByText('page · 82%')).toBeTruthy();
    expect(screen.getByText('spec.pdf').closest('a')?.getAttribute('href')).toBe('/memory/documents?document=d1');
    expect(screen.getByText('memory · Source of this page')).toBeTruthy();
    // The source memory cannot be promoted again; the other one can.
    expect(screen.getAllByText('Promote')).toHaveLength(1);
    fireEvent.click(screen.getByText('Similar page'));
    expect(onOpenNote).toHaveBeenCalledWith('n2');
  });

  it('promotes a memory under the current page and opens it', async () => {
    jest.mocked(noteActions.getNoteRelated).mockResolvedValue({ success: true, related } as never);
    jest.mocked(noteActions.promoteMemoryToPage).mockResolvedValue({ success: true, note: { id: 'new' }, alreadyPromoted: false } as never);
    const onOpenNote = jest.fn();
    render(<NoteRelatedPanel noteId="n1" onOpenNote={onOpenNote} d />);
    fireEvent.click(await screen.findByText('Promote'));
    await waitFor(() => expect(onOpenNote).toHaveBeenCalledWith('new'));
    expect(noteActions.promoteMemoryToPage).toHaveBeenCalledWith('m1', { parentId: 'n1' });
  });

  it('explains when the page is not indexed yet', async () => {
    jest.mocked(noteActions.getNoteRelated).mockResolvedValue({
      success: true, related: { semanticAvailable: false, notes: [], documents: [], memories: [] },
    } as never);
    render(<NoteRelatedPanel noteId="n1" onOpenNote={jest.fn()} d={false} />);
    expect(await screen.findByText(/appear once this page is indexed/)).toBeTruthy();
  });

  it('renders nothing when there is nothing related', async () => {
    jest.mocked(noteActions.getNoteRelated).mockResolvedValue({
      success: true, related: { semanticAvailable: true, notes: [], documents: [], memories: [] },
    } as never);
    const { container } = render(<NoteRelatedPanel noteId="n1" onOpenNote={jest.fn()} d={false} />);
    await waitFor(() => expect(noteActions.getNoteRelated).toHaveBeenCalledWith('n1'));
    expect(container.textContent).toBe('');
  });
});
