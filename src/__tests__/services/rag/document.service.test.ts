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
      'DELETE FROM documents WHERE id = $1 AND uploaded_by = $2',
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
      'SELECT * FROM documents WHERE uploaded_by = $1 AND domain_slug = $2 ORDER BY uploaded_at DESC',
      ['user-a', 'notes']
    );
  });
});
