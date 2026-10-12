import '../../__mocks__/db';
import pool from '@/app/clients/db';
import {
  assertEmbeddingRuntimeState,
  clearEmbeddingRuntimeValidationCache,
} from '@/app/services/rag/embedding-runtime.service';

const mockQuery = jest.mocked(pool.query);
const metadata = {
  provider: 'ollama',
  model: 'embeddinggemma',
  dimensions: 768,
  version: 'ollama:embeddinggemma:v1',
};

describe('embedding runtime compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearEmbeddingRuntimeValidationCache();
  });

  it('accepts the configured vector space when it matches persisted state', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [metadata] } as never);

    await expect(assertEmbeddingRuntimeState(metadata)).resolves.toEqual(metadata);
  });

  it('fails closed when the model or version differs', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...metadata, model: 'another-model', version: 'ollama:another-model:v1' }],
    } as never);

    await expect(assertEmbeddingRuntimeState(metadata)).rejects.toThrow(
      'Embedding runtime mismatch',
    );
  });
});
