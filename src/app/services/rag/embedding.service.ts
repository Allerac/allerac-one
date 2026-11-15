/**
 * Provider-neutral embedding facade.
 *
 * Semantic feature code depends on this service rather than a provider-specific
 * API. The default provider is the local Ollama deployment; EMBEDDING_PROVIDER=openai
 * selects OpenAI (see docs/operations/embeddings.md).
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
import {
  OpenAIEmbeddingProvider,
  type OpenAIEmbeddingProviderConfig,
} from './openai-embedding.provider';
import { assertEmbeddingRuntimeState } from './embedding-runtime.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { embeddingScheduler } from './embedding-scheduler';

const DEFAULT_MODEL = 'embeddinggemma';
const DEFAULT_DIMENSIONS = 768;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_KEEP_ALIVE = '10m';
const DEFAULT_OPENAI_MODEL = 'text-embedding-3-small';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_BATCH_SIZE = 96;

export type EmbeddingProviderName = 'ollama' | 'openai';

/** Provider chosen by EMBEDDING_PROVIDER. Anything other than "openai" keeps Ollama. */
export function configuredEmbeddingProvider(): EmbeddingProviderName {
  const value = (process.env.EMBEDDING_PROVIDER ?? '').trim().toLowerCase();
  if (value === 'openai') return 'openai';
  if (value && value !== 'ollama') {
    console.warn(`[RAG] Unknown EMBEDDING_PROVIDER "${value}", using ollama`);
  }
  return 'ollama';
}

/** Vector size shared by every provider; it must match the pgvector columns. */
export function configuredEmbeddingDimensions(): number {
  return positiveInteger(process.env.EMBEDDING_DIMENSIONS, DEFAULT_DIMENSIONS);
}

/** Model name the configured provider will use, without creating a provider. */
export function configuredEmbeddingModel(): string {
  return configuredEmbeddingProvider() === 'openai'
    ? process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_OPENAI_MODEL
    : process.env.EMBEDDING_MODEL || DEFAULT_MODEL;
}

export async function resolveOpenAIEmbeddingKey(): Promise<string | null> {
  const stored = await new SystemSettingsService().get('openai_api_key').catch(() => null);
  return stored?.trim() || process.env.OPENAI_API_KEY?.trim() || null;
}

export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
}

export interface EmbeddingServiceConfig {
  provider?: EmbeddingProvider;
  ollama?: Partial<OllamaEmbeddingProviderConfig>;
  openai?: Partial<OpenAIEmbeddingProviderConfig>;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createOpenAIProvider(
  overrides: Partial<OpenAIEmbeddingProviderConfig> = {},
): EmbeddingProvider {
  const model = overrides.model
    ?? (process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_OPENAI_MODEL);
  const dimensions = overrides.dimensions ?? configuredEmbeddingDimensions();
  return new OpenAIEmbeddingProvider({
    baseUrl: overrides.baseUrl
      ?? (process.env.OPENAI_EMBEDDING_BASE_URL || DEFAULT_OPENAI_BASE_URL),
    model,
    dimensions,
    timeoutMs: overrides.timeoutMs
      ?? positiveInteger(process.env.EMBEDDING_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    version: overrides.version
      ?? (process.env.OPENAI_EMBEDDING_VERSION || `openai:${model}:${dimensions}:v1`),
    batchSize: overrides.batchSize
      ?? positiveInteger(process.env.OPENAI_EMBEDDING_BATCH_SIZE, DEFAULT_OPENAI_BATCH_SIZE),
    resolveApiKey: overrides.resolveApiKey ?? resolveOpenAIEmbeddingKey,
  });
}

function createDefaultProvider(config: EmbeddingServiceConfig): EmbeddingProvider {
  if (config.ollama && !config.openai) return createOllamaProvider(config.ollama);
  if (config.openai || configuredEmbeddingProvider() === 'openai') {
    return createOpenAIProvider(config.openai);
  }
  return createOllamaProvider(config.ollama);
}

function createOllamaProvider(
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
      ?? createDefaultProvider(resolvedConfig);
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
