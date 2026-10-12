import '../../__mocks__/db';
import pool from '@/app/clients/db';

const reprocessDocumentContent = jest.fn();
const processDocumentContent = jest.fn();
const createDocumentRecord = jest.fn();

jest.mock('@/app/services/rag/embedding.service', () => ({
  EmbeddingService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@/app/services/rag/document.service', () => ({
  DocumentService: jest.fn().mockImplementation(() => ({
    reprocessDocumentContent,
    processDocumentContent,
    createDocumentRecord,
  })),
}));

import { NotesService } from '@/app/services/notes/notes.service';
import {
  NoteReindexQueue,
  buildNoteIndexText,
  hashNoteIndexText,
} from '@/app/services/notes/note-reindex-queue';

const mockQuery = jest.mocked(pool.query);

function noteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note-a', title: 'Editor', content: 'Gian uses VS Code', document_id: 'doc-a',
    content_hash: null, document_status: 'completed', ...overrides,
  };
}

describe('NotesService.reindexNote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  it('skips when the indexed text is unchanged', async () => {
    const hash = hashNoteIndexText(buildNoteIndexText('Editor', 'Gian uses VS Code'));
    mockQuery.mockResolvedValueOnce({ rows: [noteRow({ content_hash: hash })], rowCount: 1 } as never);

    const result = await new NotesService().reindexNote('user-a', 'note-a');

    expect(result).toBe('skipped');
    expect(reprocessDocumentContent).not.toHaveBeenCalled();
    expect(mockQuery.mock.calls[0][1]).toEqual(['note-a', 'user-a']);
  });

  it('re-embeds title + content, renames the document and stores the hash', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [noteRow({ content_hash: 'stale' })], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [{ status: 'completed' }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    const result = await new NotesService().reindexNote('user-a', 'note-a');

    const text = 'Editor\n\nGian uses VS Code';
    expect(result).toBe('reindexed');
    expect(mockQuery.mock.calls[1][0]).toContain('UPDATE documents SET filename');
    expect(mockQuery.mock.calls[1][1]).toEqual(['Editor', text.length, 'doc-a', 'user-a']);
    expect(reprocessDocumentContent).toHaveBeenCalledWith('doc-a', text);
    expect(mockQuery.mock.calls[3][1]).toEqual([hashNoteIndexText(text), 'note-a', 'user-a']);
  });

  it('retries a failed document even when the hash matches', async () => {
    const hash = hashNoteIndexText(buildNoteIndexText('Editor', 'Gian uses VS Code'));
    mockQuery
      .mockResolvedValueOnce({ rows: [noteRow({ content_hash: hash, document_status: 'failed' })], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [{ status: 'failed' }], rowCount: 1 } as never);

    const result = await new NotesService().reindexNote('user-a', 'note-a');

    expect(reprocessDocumentContent).toHaveBeenCalled();
    expect(result).toBe('failed');
    expect(mockQuery).toHaveBeenCalledTimes(3); // hash not recorded
  });

  it('creates a note-backed document when the note has none', async () => {
    createDocumentRecord.mockResolvedValueOnce('doc-new');
    mockQuery
      .mockResolvedValueOnce({ rows: [noteRow({ document_id: null, document_status: null })], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [{ status: 'completed' }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    const result = await new NotesService().reindexNote('user-a', 'note-a');

    expect(result).toBe('reindexed');
    expect(createDocumentRecord).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Editor' }), 'user-a', 'notes', { type: 'note', id: 'note-a' },
    );
    expect(processDocumentContent).toHaveBeenCalledWith('doc-new', 'Editor\n\nGian uses VS Code');
  });

  it('returns missing for notes the user does not own', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    expect(await new NotesService().reindexNote('user-b', 'note-a')).toBe('missing');
  });
});

describe('NoteReindexQueue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('debounces repeated saves into one reindex', async () => {
    const reindex = jest.fn().mockResolvedValue(undefined);
    const queue = new NoteReindexQueue(reindex, 1000);

    queue.schedule('user-a', 'note-a');
    jest.advanceTimersByTime(600);
    queue.schedule('user-a', 'note-a');
    jest.advanceTimersByTime(600);
    queue.schedule('user-a', 'note-a');
    expect(reindex).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);
    await queue.flush();
    expect(reindex).toHaveBeenCalledTimes(1);
    expect(reindex).toHaveBeenCalledWith('user-a', 'note-a');
  });

  it('runs one follow-up when a save lands during a running reindex', async () => {
    let release!: () => void;
    const reindex = jest.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }))
      .mockResolvedValue(undefined);
    const queue = new NoteReindexQueue(reindex, 10);

    queue.schedule('user-a', 'note-a');
    jest.advanceTimersByTime(10);
    await Promise.resolve();
    queue.schedule('user-a', 'note-a');
    jest.advanceTimersByTime(10);
    queue.schedule('user-a', 'note-a');
    jest.advanceTimersByTime(10);
    expect(queue.getStats().running).toBe(1);

    release();
    await queue.flush();
    expect(reindex).toHaveBeenCalledTimes(2);
  });

  it('keeps notes independent and survives failures', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const reindex = jest.fn().mockRejectedValueOnce(new Error('ollama down')).mockResolvedValue(undefined);
    const queue = new NoteReindexQueue(reindex, 0);

    queue.schedule('user-a', 'note-a');
    queue.schedule('user-a', 'note-b');
    await queue.flush();

    expect(reindex).toHaveBeenCalledTimes(2);
    expect(queue.getStats()).toEqual({ pending: 0, running: 0 });
    errorSpy.mockRestore();
  });

  it('cancel drops pending work', async () => {
    const reindex = jest.fn();
    const queue = new NoteReindexQueue(reindex, 1000);
    queue.schedule('user-a', 'note-a');
    queue.cancel('note-a');
    await queue.flush();
    expect(reindex).not.toHaveBeenCalled();
  });
});
