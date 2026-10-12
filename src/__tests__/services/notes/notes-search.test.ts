import '../../__mocks__/db';
import pool from '@/app/clients/db';

jest.mock('@/app/services/rag/embedding.service', () => ({
  EmbeddingService: jest.fn().mockImplementation(() => ({
    generateEmbedding: jest.fn().mockResolvedValue({ embedding: [0.1, 0.2] }),
  })),
}));

import { NotesService } from '@/app/services/notes/notes.service';

const mockQuery = jest.mocked(pool.query);

describe('NotesService.searchNotes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns one row per note, scoped to the user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ note_id: 'n1' }], rowCount: 1 } as never);

    const rows = await new NotesService().searchNotes('user-a', 'editor', null, 3);

    const [sql, params] = mockQuery.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('DISTINCT ON (n.id)');
    expect(sql).toContain('d.uploaded_by = $2');
    expect(sql).toContain('n.user_id = d.uploaded_by');
    expect(params).toEqual(['[0.1,0.2]', 'user-a', 3]);
    expect(rows).toEqual([{ note_id: 'n1' }]);
  });
});
