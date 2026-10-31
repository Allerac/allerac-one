/**
 * Embeds memories (conversation_summaries) into knowledge_semantic_index so
 * that recall is semantic instead of keyword-only.
 *
 * Indexing always runs at background ('document') priority through the shared
 * EmbeddingScheduler, so with EMBEDDING_MAX_CONCURRENT=1 interactive queries
 * still go first. Rows are keyed by a content hash and the embedding version,
 * so unchanged memories are never re-embedded.
 */

import { notFederatedSummarySql } from '@/app/services/memory/federated-memory-filter';
import { createHash } from 'crypto';
import pool from '@/app/clients/db';
import { EmbeddingService } from '@/app/services/rag/embedding.service';

export type MemoryIndexOutcome = 'reindexed' | 'skipped' | 'missing' | 'failed';

/** Text that is embedded for a memory. Mirrored by MEMORY_INDEX_HASH_SQL. */
export function buildMemoryIndexText(summary: string, topics: string[] | null | undefined): string {
  const list = (topics ?? []).filter((topic): topic is string => typeof topic === 'string');
  return list.length > 0 ? `${summary}\n\nTopics: ${list.join(', ')}` : summary;
}

export function hashMemoryIndexText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** SQL expression equal to hashMemoryIndexText(buildMemoryIndexText(...)) for alias `cs`. */
export const MEMORY_INDEX_HASH_SQL = `encode(sha256(convert_to(
  cs.summary || CASE WHEN coalesce(cardinality(array_remove(cs.key_topics, NULL)), 0) > 0
                     THEN E'\\n\\nTopics: ' || array_to_string(cs.key_topics, ', ')
                     ELSE '' END, 'UTF8')), 'hex')`;

/**
 * Memories whose index row is missing, stale or from another embedding version.
 * $1 = keyset cursor (memory id or NULL), $2 = limit, $3 = current embedding version.
 */
export const STALE_MEMORY_CANDIDATES_SQL = `
  SELECT cs.id, cs.user_id
  FROM conversation_summaries cs
  LEFT JOIN knowledge_semantic_index ksi
    ON ksi.source_type = 'memory' AND ksi.source_id = cs.id
   AND ksi.user_id = cs.user_id AND ksi.chunk_index = 0
  WHERE btrim(coalesce(cs.summary, '')) <> ''
    AND ${notFederatedSummarySql('cs')}
    AND ($1::uuid IS NULL OR cs.id > $1::uuid)
    AND (
      ksi.source_id IS NULL
      OR ksi.embedding_version <> $3
      OR ksi.content_hash <> ${MEMORY_INDEX_HASH_SQL}
    )
  ORDER BY cs.id
  LIMIT $2`;

export class MemoryIndexService {
  constructor(private readonly embeddings: EmbeddingService = new EmbeddingService()) {}

  embeddingVersion(): string {
    return this.embeddings.getMetadata().version;
  }

  async indexMemory(userId: string, memoryId: string): Promise<MemoryIndexOutcome> {
    const memory = await pool.query(
      `SELECT cs.id, cs.user_id, cs.summary, cs.key_topics, cs.domain_slug,
              NOT ${notFederatedSummarySql('cs')} AS federated
       FROM conversation_summaries cs WHERE cs.id = $1 AND cs.user_id = $2`,
      [memoryId, userId],
    );
    const row = memory.rows[0];
    if (row?.federated) {
      // Never index memories of federated conversations; drop any stale row.
      await pool.query(
        `DELETE FROM knowledge_semantic_index WHERE user_id = $1 AND source_type = 'memory' AND source_id = $2`,
        [userId, memoryId],
      );
      return 'missing';
    }
    if (!row || !String(row.summary ?? '').trim()) return 'missing';

    const text = buildMemoryIndexText(row.summary, row.key_topics);
    const hash = hashMemoryIndexText(text);
    const metadata = this.embeddings.getMetadata();

    const existing = await pool.query(
      `SELECT content_hash, embedding_version, domain_slug FROM knowledge_semantic_index
       WHERE user_id = $1 AND source_type = 'memory' AND source_id = $2 AND chunk_index = 0`,
      [userId, memoryId],
    );
    const current = existing.rows[0];
    if (current && current.content_hash === hash && current.embedding_version === metadata.version) {
      if ((current.domain_slug ?? null) !== (row.domain_slug ?? null)) {
        await pool.query(
          `UPDATE knowledge_semantic_index SET domain_slug = $3
           WHERE user_id = $1 AND source_type = 'memory' AND source_id = $2`,
          [userId, memoryId, row.domain_slug ?? null],
        );
      }
      return 'skipped';
    }

    let embedding: number[];
    try {
      ({ embedding } = await this.embeddings.generateEmbedding(text, 'document'));
    } catch (error) {
      console.warn('[MemoryIndex] Embedding failed:', error instanceof Error ? error.message : error);
      return 'failed';
    }

    await pool.query(
      `INSERT INTO knowledge_semantic_index
         (user_id, source_type, source_id, chunk_index, content, domain_slug, embedding,
          embedding_provider, embedding_model, embedding_version, content_hash, indexed_at)
       VALUES ($1, 'memory', $2, 0, $3, $4, $5::vector, $6, $7, $8, $9, NOW())
       ON CONFLICT (user_id, source_type, source_id, chunk_index) DO UPDATE SET
         content = EXCLUDED.content,
         domain_slug = EXCLUDED.domain_slug,
         embedding = EXCLUDED.embedding,
         embedding_provider = EXCLUDED.embedding_provider,
         embedding_model = EXCLUDED.embedding_model,
         embedding_version = EXCLUDED.embedding_version,
         content_hash = EXCLUDED.content_hash,
         indexed_at = NOW()`,
      [userId, memoryId, text, row.domain_slug ?? null, `[${embedding.join(',')}]`,
        metadata.provider, metadata.model, metadata.version, hash],
    );
    return 'reindexed';
  }
}
