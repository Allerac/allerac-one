import pool from '@/app/clients/db';
import type { EmbeddingProviderMetadata } from './embedding-provider';

export interface EmbeddingRuntimeState {
  provider: string;
  model: string;
  dimensions: number;
  version: string;
}

const VALIDATION_TTL_MS = 30_000;
const validatedUntil = new Map<string, number>();

function metadataKey(metadata: EmbeddingProviderMetadata): string {
  return `${metadata.provider}:${metadata.model}:${metadata.dimensions}:${metadata.version}`;
}

export async function getEmbeddingRuntimeState(): Promise<EmbeddingRuntimeState | null> {
  const result = await pool.query(
    `SELECT provider, model, dimensions, version
     FROM embedding_runtime_state
     WHERE singleton = true`,
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    provider: row.provider,
    model: row.model,
    dimensions: Number(row.dimensions),
    version: row.version,
  };
}

export async function assertEmbeddingRuntimeState(
  metadata: EmbeddingProviderMetadata,
  force = false,
): Promise<EmbeddingRuntimeState> {
  const key = metadataKey(metadata);
  if (!force && (validatedUntil.get(key) ?? 0) > Date.now()) {
    return { ...metadata };
  }

  const state = await getEmbeddingRuntimeState();
  if (!state) {
    throw new Error('Embedding runtime state is missing; run the local embedding migration');
  }

  const compatible = state.provider === metadata.provider
    && state.model === metadata.model
    && state.dimensions === metadata.dimensions
    && state.version === metadata.version;
  if (!compatible) {
    throw new Error(
      `Embedding runtime mismatch: database=${JSON.stringify(state)}, configured=${JSON.stringify(metadata)}. Reindex before changing embedding space.`,
    );
  }

  validatedUntil.set(key, Date.now() + VALIDATION_TTL_MS);
  return state;
}

export function clearEmbeddingRuntimeValidationCache(): void {
  validatedUntil.clear();
}
