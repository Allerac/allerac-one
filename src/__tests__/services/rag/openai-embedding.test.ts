/** @jest-environment node */

import { OpenAIEmbeddingProvider } from '@/app/services/rag/openai-embedding.provider';
import {
  EmbeddingService,
  configuredEmbeddingDimensions,
  configuredEmbeddingModel,
  configuredEmbeddingProvider,
  resolveOpenAIEmbeddingKey,
} from '@/app/services/rag/embedding.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import pool from '@/app/clients/db';

jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: jest.fn() } }));

const ENV_KEYS = [
  'EMBEDDING_PROVIDER',
  'EMBEDDING_DIMENSIONS',
  'EMBEDDING_MODEL',
  'EMBEDDING_VERSION',
  'OPENAI_EMBEDDING_MODEL',
  'OPENAI_EMBEDDING_VERSION',
  'OPENAI_EMBEDDING_BASE_URL',
  'OPENAI_API_KEY',
] as const;
const savedEnv: Record<string, string | undefined> = {};
const originalFetch = global.fetch;

function vectors(count: number, dims: number, offset = 0) {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    embedding: Array.from({ length: dims }, () => (i + offset) / 10),
  }));
}

function okResponse(body: unknown) {
  return { ok: true, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

function provider(overrides: Partial<ConstructorParameters<typeof OpenAIEmbeddingProvider>[0]> = {}) {
  return new OpenAIEmbeddingProvider({
    baseUrl: 'https://api.openai.test/v1/',
    model: 'text-embedding-3-small',
    dimensions: 4,
    timeoutMs: 1_000,
    version: 'openai:text-embedding-3-small:4:v1',
    batchSize: 96,
    resolveApiKey: async () => 'sk-test',
    ...overrides,
  });
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('OpenAIEmbeddingProvider', () => {
  it('requests the configured dimensions and returns vectors in input order', async () => {
    const data = vectors(2, 4).reverse();
    global.fetch = jest.fn().mockResolvedValue(okResponse({ data, usage: { prompt_tokens: 7 } }));

    const result = await provider().embed(['one', 'two'], 'document');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = jest.mocked(global.fetch).mock.calls[0];
    expect(url).toBe('https://api.openai.test/v1/embeddings');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'text-embedding-3-small',
      input: ['one', 'two'],
      dimensions: 4,
      encoding_format: 'float',
    });
    expect(result.embeddings).toEqual([[0, 0, 0, 0], [0.1, 0.1, 0.1, 0.1]]);
    expect(result.tokenCount).toBe(7);
  });

  it('splits large inputs into batches', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(okResponse({ data: vectors(2, 4), usage: { prompt_tokens: 2 } }))
      .mockResolvedValueOnce(okResponse({ data: vectors(1, 4, 2), usage: { prompt_tokens: 1 } }));

    const result = await provider({ batchSize: 2 }).embed(['a', 'b', 'c'], 'document');

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.embeddings).toHaveLength(3);
    expect(result.embeddings[2]).toEqual([0.2, 0.2, 0.2, 0.2]);
    expect(result.tokenCount).toBe(3);
  });

  it('refuses vectors whose size does not match the column', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse({ data: vectors(1, 1536) }));
    await expect(provider().embed(['x'], 'query')).rejects.toThrow(
      'Embedding dimension mismatch: expected 4, received 1536',
    );
  });

  it('refuses a short response', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse({ data: vectors(1, 4) }));
    await expect(provider().embed(['x', 'y'], 'document')).rejects.toThrow(
      'OpenAI returned 1 embeddings for 2 inputs',
    );
  });

  it('reports HTTP errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid key',
    } as unknown as Response);
    await expect(provider().embed(['x'], 'query')).rejects.toThrow(
      'OpenAI embedding request failed: 401 - invalid key',
    );
  });

  it('fails without calling the API when no key is configured', async () => {
    global.fetch = jest.fn();
    await expect(provider({ resolveApiKey: async () => null }).embed(['x'], 'query')).rejects.toThrow(
      'OpenAI embeddings need an OpenAI API key',
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('embedding provider selection', () => {
  it('keeps Ollama as the default', () => {
    expect(configuredEmbeddingProvider()).toBe('ollama');
    const metadata = new EmbeddingService().getMetadata();
    expect(metadata).toEqual({
      provider: 'ollama',
      model: 'embeddinggemma',
      dimensions: 768,
      version: 'ollama:embeddinggemma:v1',
    });
  });

  it('falls back to Ollama for unknown values', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.EMBEDDING_PROVIDER = 'something-else';
    expect(configuredEmbeddingProvider()).toBe('ollama');
    expect(new EmbeddingService().getMetadata().provider).toBe('ollama');
  });

  it('selects OpenAI with the shared dimensions and its own model and version', () => {
    process.env.EMBEDDING_PROVIDER = 'openai';
    // Compose sets these for Ollama; they must not leak into the OpenAI space.
    process.env.EMBEDDING_MODEL = 'embeddinggemma';
    process.env.EMBEDDING_VERSION = 'ollama:embeddinggemma:v1';
    process.env.EMBEDDING_DIMENSIONS = '768';

    expect(configuredEmbeddingProvider()).toBe('openai');
    expect(configuredEmbeddingModel()).toBe('text-embedding-3-small');
    expect(configuredEmbeddingDimensions()).toBe(768);
    expect(new EmbeddingService().getMetadata()).toEqual({
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 768,
      version: 'openai:text-embedding-3-small:768:v1',
    });
  });

  it('honours OpenAI model and version overrides', () => {
    process.env.EMBEDDING_PROVIDER = 'OpenAI';
    process.env.OPENAI_EMBEDDING_MODEL = 'text-embedding-3-large';
    process.env.OPENAI_EMBEDDING_VERSION = 'openai:large:v2';
    expect(new EmbeddingService().getMetadata()).toMatchObject({
      model: 'text-embedding-3-large',
      version: 'openai:large:v2',
    });
  });

  it('refuses to embed while the database is in another space', async () => {
    process.env.EMBEDDING_PROVIDER = 'openai';
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(SystemSettingsService.prototype, 'get').mockResolvedValue('sk-from-settings');
    global.fetch = jest.fn();
    jest.mocked(pool.query).mockResolvedValue({
      rows: [{ provider: 'ollama', model: 'embeddinggemma', dimensions: 768, version: 'ollama:embeddinggemma:v1' }],
    } as never);

    await expect(new EmbeddingService().generateEmbedding('hello')).rejects.toThrow('Embedding runtime mismatch');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('embeds through OpenAI with the key from system settings', async () => {
    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.EMBEDDING_DIMENSIONS = '4';
    jest.spyOn(SystemSettingsService.prototype, 'get').mockResolvedValue('sk-from-settings');
    global.fetch = jest.fn().mockResolvedValue(okResponse({ data: vectors(1, 4) }));
    jest.mocked(pool.query).mockResolvedValue({
      rows: [{ provider: 'openai', model: 'text-embedding-3-small', dimensions: 4, version: 'openai:text-embedding-3-small:4:v1' }],
    } as never);

    const result = await new EmbeddingService().generateEmbedding('hello');

    expect(result.embedding).toEqual([0, 0, 0, 0]);
    const [, init] = jest.mocked(global.fetch).mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-from-settings');
  });
});

describe('resolveOpenAIEmbeddingKey', () => {
  it('prefers the system setting and falls back to OPENAI_API_KEY', async () => {
    const get = jest.spyOn(SystemSettingsService.prototype, 'get');
    process.env.OPENAI_API_KEY = 'sk-env';

    get.mockResolvedValueOnce('sk-settings');
    expect(await resolveOpenAIEmbeddingKey()).toBe('sk-settings');

    get.mockResolvedValueOnce(null);
    expect(await resolveOpenAIEmbeddingKey()).toBe('sk-env');

    get.mockRejectedValueOnce(new Error('db down'));
    expect(await resolveOpenAIEmbeddingKey()).toBe('sk-env');

    delete process.env.OPENAI_API_KEY;
    get.mockResolvedValueOnce('  ');
    expect(await resolveOpenAIEmbeddingKey()).toBeNull();
  });
});
