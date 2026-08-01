import { requireCurrentUser } from '@/app/lib/auth-session';
import { VectorSearchService } from '@/app/services/rag/vector-search.service';
import { EmbeddingService } from '@/app/services/rag/embedding.service';
import { getRelevantContext } from '@/app/actions/rag';

const mockGetRelevantContext = jest.fn();

jest.mock('@/app/lib/auth-session', () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock('@/app/services/rag/embedding.service', () => ({
  EmbeddingService: jest.fn(),
}));

jest.mock('@/app/services/rag/vector-search.service', () => ({
  VectorSearchService: jest.fn().mockImplementation(() => ({
    getRelevantContext: mockGetRelevantContext,
  })),
}));

describe('RAG action authorization', () => {
  it('uses the session user with the local embedding service', async () => {
    jest.mocked(requireCurrentUser).mockResolvedValue({
      id: 'user-a',
      email: 'a@example.com',
      name: 'User A',
      is_admin: false,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    });

    mockGetRelevantContext.mockResolvedValue('context');

    const result = await getRelevantContext('query');

    expect(result).toBe('context');
    expect(EmbeddingService).toHaveBeenCalledWith();
    expect(mockGetRelevantContext).toHaveBeenCalledWith('query', 'user-a');
  });
});
