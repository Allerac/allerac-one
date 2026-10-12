import '../../__mocks__/db';
import pool from '@/app/clients/db';
import { DocumentService } from '@/app/services/rag/document.service';
import type { EmbeddingService } from '@/app/services/rag/embedding.service';

const mockQuery = jest.mocked(pool.query);

describe('DocumentService ownership', () => {
  let documentService: DocumentService;

  beforeEach(() => {
    jest.clearAllMocks();
    documentService = new DocumentService({} as EmbeddingService);
  });

  it('scopes document deletion to the owner', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await documentService.deleteDocument('doc-a', 'user-a');

    expect(mockQuery).toHaveBeenCalledWith(
      "DELETE FROM documents WHERE id = $1 AND uploaded_by = $2 AND source_type <> 'note'",
      ['doc-a', 'user-a']
    );
  });

  it('rejects deletion when the document is not owned by the user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await expect(documentService.deleteDocument('doc-b', 'user-a')).rejects.toThrow(
      'Document not found or you do not have permission to delete it'
    );
  });

  it('scopes document listing by user and domain', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await documentService.getAllDocuments('user-a', 'notes');

    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT * FROM documents WHERE uploaded_by = $1 AND domain_slug = $2 AND source_type <> 'note' ORDER BY uploaded_at DESC",
      ['user-a', 'notes']
    );
  });

  it('removes stale chunks before reprocessing changed content', async () => {
    const embeddingService = {
      generateEmbeddingsBatch: jest.fn().mockResolvedValue([
        { embedding: [0.1, 0.2], tokenCount: 2 },
      ]),
    } as unknown as EmbeddingService;
    documentService = new DocumentService(embeddingService);
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as never);

    await documentService.reprocessDocumentContent('doc-a', 'Replacement content');

    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("SET status = 'processing'"),
      ['doc-a'],
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM document_chunks WHERE document_id = $1',
      ['doc-a'],
    );
    expect(embeddingService.generateEmbeddingsBatch).toHaveBeenCalledWith(
      ['Replacement content'],
    );
    expect(mockQuery).toHaveBeenCalledWith(
      'UPDATE documents SET status = $1, error_message = $2 WHERE id = $3',
      ['completed', null, 'doc-a'],
    );
  });

  it('hides note-backed documents from the unscoped document list', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await documentService.getAllDocuments('user-a');

    expect(mockQuery.mock.calls[0][0]).toContain("source_type <> 'note'");
    expect(mockQuery.mock.calls[0][1]).toEqual(['user-a']);
  });

  it('refuses to delete a note-backed document directly', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await expect(documentService.deleteDocument('note-doc', 'user-a')).rejects.toThrow('Document not found');
  });

  it('records the document source on creation', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'doc-n' }], rowCount: 1 } as never);
    const file = { name: 'Note', type: 'text/plain', size: 4 } as File;

    await documentService.createDocumentRecord(file, 'user-a', 'notes', { type: 'note' });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'doc-u' }], rowCount: 1 } as never);
    await documentService.createDocumentRecord(file, 'user-a', null);

    expect(mockQuery.mock.calls[0][1]).toEqual(['Note', 'text/plain', 4, 'user-a', 'processing', 'notes', 'note', null]);
    expect(mockQuery.mock.calls[1][1]).toEqual(['Note', 'text/plain', 4, 'user-a', 'processing', null, 'upload', null]);
  });
});
