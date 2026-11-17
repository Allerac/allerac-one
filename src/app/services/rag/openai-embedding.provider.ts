import type {
  EmbeddingProvider,
  EmbeddingProviderMetadata,
  EmbeddingProviderResult,
  EmbeddingPurpose,
} from './embedding-provider';

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

export interface OpenAIEmbeddingProviderConfig {
  baseUrl: string;
  model: string;
  /**
   * Requested output size. text-embedding-3 models accept a `dimensions`
   * parameter, which lets the vectors match the existing pgvector columns.
   */
  dimensions: number;
  timeoutMs: number;
  version: string;
  /** Maximum inputs per request. */
  batchSize: number;
  /** Returns the API key at call time so a key saved in Settings applies without a restart. */
  resolveApiKey: () => Promise<string | null>;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly metadata: EmbeddingProviderMetadata;
  private readonly config: OpenAIEmbeddingProviderConfig;

  constructor(config: OpenAIEmbeddingProviderConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl.replace(/\/$/, ''),
      batchSize: Math.max(1, config.batchSize),
    };
    this.metadata = {
      provider: 'openai',
      model: config.model,
      dimensions: config.dimensions,
      version: config.version,
    };
  }

  async embed(
    texts: string[],
    purpose: EmbeddingPurpose,
  ): Promise<EmbeddingProviderResult> {
    // OpenAI embeddings use the same input for queries and documents.
    void purpose;
    const apiKey = (await this.config.resolveApiKey())?.trim();
    if (!apiKey) {
      throw new Error('OpenAI embeddings need an OpenAI API key in Settings or OPENAI_API_KEY');
    }

    const embeddings: number[][] = [];
    let tokenCount = 0;
    for (let start = 0; start < texts.length; start += this.config.batchSize) {
      const batch = texts.slice(start, start + this.config.batchSize);
      const result = await this.embedBatch(batch, apiKey);
      embeddings.push(...result.embeddings);
      tokenCount += result.tokenCount;
    }
    return { embeddings, tokenCount };
  }

  private async embedBatch(texts: string[], apiKey: string): Promise<EmbeddingProviderResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          input: texts,
          dimensions: this.config.dimensions,
          encoding_format: 'float',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = (await response.text()).slice(0, 500);
        throw new Error(
          `OpenAI embedding request failed: ${response.status} - ${errorText}`,
        );
      }

      const data = await response.json() as OpenAIEmbeddingResponse;
      if (!Array.isArray(data.data) || data.data.length !== texts.length) {
        throw new Error(
          `OpenAI returned ${data.data?.length ?? 0} embeddings for ${texts.length} inputs`,
        );
      }

      const ordered = [...data.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const embeddings = ordered.map((item) => item.embedding);
      for (const embedding of embeddings) {
        if (!Array.isArray(embedding) || embedding.length !== this.config.dimensions) {
          throw new Error(
            `Embedding dimension mismatch: expected ${this.config.dimensions}, received ${Array.isArray(embedding) ? embedding.length : 0}`,
          );
        }
      }

      return {
        embeddings: embeddings as number[][],
        tokenCount: data.usage?.prompt_tokens ?? data.usage?.total_tokens ?? 0,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `OpenAI embedding request timed out after ${this.config.timeoutMs}ms`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
