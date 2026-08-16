export type EmbeddingPurpose = 'query' | 'document';

export interface EmbeddingProviderMetadata {
  provider: string;
  model: string;
  dimensions: number;
  version: string;
}

export interface EmbeddingProviderResult {
  embeddings: number[][];
  tokenCount: number;
}

export interface EmbeddingProvider {
  readonly metadata: EmbeddingProviderMetadata;
  embed(texts: string[], purpose: EmbeddingPurpose): Promise<EmbeddingProviderResult>;
}

