import type {
  EmbeddingProvider,
  EmbeddingProviderMetadata,
  EmbeddingProviderResult,
  EmbeddingPurpose,
} from './embedding-provider';

interface OllamaEmbedResponse {
  embeddings?: number[][];
  prompt_eval_count?: number;
}

export interface OllamaEmbeddingProviderConfig {
  baseUrl: string;
  model: string;
  dimensions: number;
  timeoutMs: number;
  keepAlive: string;
  version: string;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly metadata: EmbeddingProviderMetadata;
  private readonly config: OllamaEmbeddingProviderConfig;

  constructor(config: OllamaEmbeddingProviderConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl.replace(/\/$/, ''),
    };
    this.metadata = {
      provider: 'ollama',
      model: config.model,
      dimensions: config.dimensions,
      version: config.version,
    };
  }

  async embed(
    texts: string[],
    purpose: EmbeddingPurpose,
  ): Promise<EmbeddingProviderResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          input: texts.map((text) => this.prepareInput(text, purpose)),
          keep_alive: this.config.keepAlive,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama embedding request failed: ${response.status} - ${errorText}`,
        );
      }

      const data = await response.json() as OllamaEmbedResponse;
      if (!Array.isArray(data.embeddings) || data.embeddings.length !== texts.length) {
        throw new Error(
          `Ollama returned ${data.embeddings?.length ?? 0} embeddings for ${texts.length} inputs`,
        );
      }

      for (const embedding of data.embeddings) {
        if (embedding.length !== this.config.dimensions) {
          throw new Error(
            `Embedding dimension mismatch: expected ${this.config.dimensions}, received ${embedding.length}`,
          );
        }
      }

      return {
        embeddings: data.embeddings,
        tokenCount: data.prompt_eval_count ?? 0,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `Ollama embedding request timed out after ${this.config.timeoutMs}ms`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private prepareInput(text: string, purpose: EmbeddingPurpose): string {
    if (this.config.model.startsWith('nomic-embed-text-v2-moe')) {
      return `${purpose === 'query' ? 'search_query' : 'search_document'}: ${text}`;
    }
    return text;
  }
}
