/**
 * Provider-neutral embedding facade.
 *
 * Semantic feature code depends on this service rather than a provider-specific
 * API. The default provider is the local Ollama deployment.
 */

import type {
  EmbeddingProvider,
  EmbeddingProviderMetadata,
  EmbeddingPurpose,
} from './embedding-provider';
import {
  OllamaEmbeddingProvider,
  type OllamaEmbeddingProviderConfig,
} from './ollama-embedding.provider';
import { assertEmbeddingRuntimeState } from './embedding-runtime.service';
import { embeddingScheduler } from './embedding-scheduler';

const DEFAULT_MODEL = 'embeddinggemma';
const DEFAULT_DIMENSIONS = 768;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_KEEP_ALIVE = '10m';

export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
}

export interface EmbeddingServiceConfig {
  provider?: EmbeddingProvider;
  ollama?: Partial<OllamaEmbeddingProviderConfig>;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createDefaultProvider(
  overrides: Partial<OllamaEmbeddingProviderConfig> = {},
): EmbeddingProvider {
  const model = overrides.model
    ?? process.env.EMBEDDING_MODEL
    ?? DEFAULT_MODEL;
  const dimensions = overrides.dimensions
    ?? positiveInteger(process.env.EMBEDDING_DIMENSIONS, DEFAULT_DIMENSIONS);

  return new OllamaEmbeddingProvider({
    baseUrl: overrides.baseUrl
      ?? process.env.EMBEDDING_BASE_URL
      ?? process.env.OLLAMA_BASE_URL
      ?? 'http://host.docker.internal:11434',
    model,
    dimensions,
    timeoutMs: overrides.timeoutMs
      ?? positiveInteger(process.env.EMBEDDING_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    keepAlive: overrides.keepAlive
      ?? process.env.EMBEDDING_KEEP_ALIVE
      ?? DEFAULT_KEEP_ALIVE,
    version: overrides.version
      ?? process.env.EMBEDDING_VERSION
      ?? `ollama:${model}:v1`,
  });
}

export class EmbeddingService {
  private readonly provider: EmbeddingProvider;
  private readonly validateRuntime: boolean;

  /**
   * String arguments are accepted temporarily for compatibility with callers that
   * previously passed a GitHub token. The value is intentionally ignored.
   */
  constructor(config: EmbeddingServiceConfig | string = {}) {
    const resolvedConfig = typeof config === 'string' ? {} : config;
    this.provider = resolvedConfig.provider
      ?? createDefaultProvider(resolvedConfig.ollama);
    this.validateRuntime = !resolvedConfig.provider;
  }

  async generateEmbedding(
    text: string,
    purpose: EmbeddingPurpose = 'query',
  ): Promise<EmbeddingResult> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    try {
      if (this.validateRuntime) {
        await assertEmbeddingRuntimeState(this.provider.metadata);
      }
      const result = await embeddingScheduler.schedule(
        purpose,
        () => this.provider.embed([text], purpose),
      );
      return {
        embedding: result.embeddings[0],
        tokenCount: result.tokenCount,
      };
    } catch (error) {
      console.error(
        '[RAG] Error generating embedding:',
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  async generateEmbeddingsBatch(
    texts: string[],
    purpose: EmbeddingPurpose = 'document',
  ): Promise<EmbeddingResult[]> {
    if (!texts || texts.length === 0) {
      throw new Error('Texts array cannot be empty');
    }

    const validTexts = texts.filter((text) => text && text.trim().length > 0);
    if (validTexts.length === 0) {
      throw new Error('No valid texts to process');
    }

    try {
      if (this.validateRuntime) {
        await assertEmbeddingRuntimeState(this.provider.metadata);
      }
      const result = await embeddingScheduler.schedule(
        purpose,
        () => this.provider.embed(validTexts, purpose),
      );
      const tokenCount = result.tokenCount > 0
        ? result.tokenCount / validTexts.length
        : 0;
      return result.embeddings.map((embedding) => ({ embedding, tokenCount }));
    } catch (error) {
      console.error(
        '[RAG] Error generating embedding batch:',
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  getEmbeddingDimension(): number {
    return this.provider.metadata.dimensions;
  }

  getModelName(): string {
    return this.provider.metadata.model;
  }

  getMetadata(): EmbeddingProviderMetadata {
    return { ...this.provider.metadata };
  }
}
