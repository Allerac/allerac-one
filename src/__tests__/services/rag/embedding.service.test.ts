import { EmbeddingService } from '@/app/services/rag/embedding.service';
import type {
  EmbeddingProvider,
  EmbeddingPurpose,
} from '@/app/services/rag/embedding-provider';
import { OllamaEmbeddingProvider } from '@/app/services/rag/ollama-embedding.provider';

function fakeProvider(): EmbeddingProvider {
  return {
    metadata: {
      provider: 'test',
      model: 'test-model',
      dimensions: 3,
      version: 'test:v1',
    },
    embed: jest.fn(async (texts: string[], purpose: EmbeddingPurpose) => {
      void purpose;
      return {
        embeddings: texts.map(() => [0.1, 0.2, 0.3]),
        tokenCount: texts.length * 4,
      };
    }),
  };
}

describe('EmbeddingService', () => {
  it('delegates single query embeddings to the configured provider', async () => {
    const provider = fakeProvider();
    const service = new EmbeddingService({ provider });

    const result = await service.generateEmbedding('hello');

    expect(provider.embed).toHaveBeenCalledWith(['hello'], 'query');
    expect(result).toEqual({ embedding: [0.1, 0.2, 0.3], tokenCount: 4 });
    expect(service.getMetadata()).toEqual(provider.metadata);
  });

  it('delegates batches as documents and distributes token counts', async () => {
    const provider = fakeProvider();
    const service = new EmbeddingService({ provider });

    const result = await service.generateEmbeddingsBatch(['one', 'two']);

    expect(provider.embed).toHaveBeenCalledWith(['one', 'two'], 'document');
    expect(result).toEqual([
      { embedding: [0.1, 0.2, 0.3], tokenCount: 4 },
      { embedding: [0.1, 0.2, 0.3], tokenCount: 4 },
    ]);
  });

  it('rejects empty inputs before calling the provider', async () => {
    const provider = fakeProvider();
    const service = new EmbeddingService({ provider });

    await expect(service.generateEmbedding('  ')).rejects.toThrow('Text cannot be empty');
    await expect(service.generateEmbeddingsBatch(['', '  '])).rejects.toThrow(
      'No valid texts to process',
    );
    expect(provider.embed).not.toHaveBeenCalled();
  });
});

describe('OllamaEmbeddingProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses the batch embed endpoint and validates dimensions', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        embeddings: [[0.1, 0.2], [0.3, 0.4]],
        prompt_eval_count: 8,
      }),
    });
    const provider = new OllamaEmbeddingProvider({
      baseUrl: 'http://ollama:11434/',
      model: 'embeddinggemma',
      dimensions: 2,
      timeoutMs: 1_000,
      keepAlive: '10m',
      version: 'ollama:embeddinggemma:v1',
    });

    const result = await provider.embed(['one', 'two'], 'document');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://ollama:11434/api/embed',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          model: 'embeddinggemma',
          input: ['one', 'two'],
          keep_alive: '10m',
        }),
      }),
    );
    expect(result).toEqual({
      embeddings: [[0.1, 0.2], [0.3, 0.4]],
      tokenCount: 8,
    });
  });

  it('fails closed when the model returns a different dimension', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] }),
    });
    const provider = new OllamaEmbeddingProvider({
      baseUrl: 'http://ollama:11434',
      model: 'wrong-model',
      dimensions: 2,
      timeoutMs: 1_000,
      keepAlive: '10m',
      version: 'wrong:v1',
    });

    await expect(provider.embed(['one'], 'query')).rejects.toThrow(
      'Embedding dimension mismatch',
    );
  });
});
