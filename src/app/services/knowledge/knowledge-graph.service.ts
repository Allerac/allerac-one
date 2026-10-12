import pool from '@/app/clients/db';
import { KnowledgeEdge, KnowledgeGraph, KnowledgeNode } from './knowledge-graph.types';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const MAX_NEIGHBORS = 5;

interface MemoryRow {
  id: string; conversation_id: string | null; summary: string;
  key_topics: string[] | null; importance_score: number; domain_slug: string | null;
  emotion: string | null; created_at: Date | string;
}

interface DocumentRow {
  id: string; filename: string; domain_slug: string | null; status: string;
  metadata: Record<string, unknown> | null; uploaded_at: Date | string;
  source_id: string | null; canonical_url: string | null;
  attribution: Record<string, unknown> | null; chunk_count: number | string;
  has_embeddings: boolean; first_chunk: string | null;
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

function documentSummary(content: string | null): string | null {
  if (!content) return null;
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.length > 320 ? `${normalized.slice(0, 317)}…` : normalized;
}

export function buildKnowledgeEdges(nodes: KnowledgeNode[]): KnowledgeEdge[] {
  const candidates: Array<KnowledgeEdge & { priority: number }> = [];
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const left = nodes[leftIndex];
      const right = nodes[rightIndex];
      const shared = left.topics.filter(topic => right.topics.includes(topic));
      if (shared.length) {
        candidates.push({
          id: `shared_topic:${left.id}:${right.id}`, sourceNodeId: left.id,
          targetNodeId: right.id, relation: 'shared_topic',
          weight: Math.min(1, 0.55 + shared.length * 0.1), provenance: 'deterministic',
          reason: `Shared topic${shared.length > 1 ? 's' : ''}: ${shared.join(', ')}`, priority: 3,
        });
      } else if (left.metadata.sourceId && left.metadata.sourceId === right.metadata.sourceId) {
        candidates.push({
          id: `same_source:${left.id}:${right.id}`, sourceNodeId: left.id,
          targetNodeId: right.id, relation: 'same_source', weight: 0.45,
          provenance: 'deterministic',
          reason: `Same explicit source: ${String(left.metadata.sourceId)}`, priority: 2,
        });
      } else if (left.domainSlug && left.domainSlug === right.domainSlug) {
        candidates.push({
          id: `same_domain:${left.id}:${right.id}`, sourceNodeId: left.id,
          targetNodeId: right.id, relation: 'same_domain', weight: 0.2,
          provenance: 'deterministic', reason: `Same domain: ${left.domainSlug}`, priority: 1,
        });
      }
    }
  }
  const neighborCount = new Map<string, number>();
  return candidates
    .sort((left, right) => right.priority - left.priority
      || right.weight - left.weight || left.id.localeCompare(right.id))
    .filter(edge => {
      const sourceCount = neighborCount.get(edge.sourceNodeId) ?? 0;
      const targetCount = neighborCount.get(edge.targetNodeId) ?? 0;
      if (sourceCount >= MAX_NEIGHBORS || targetCount >= MAX_NEIGHBORS) return false;
      neighborCount.set(edge.sourceNodeId, sourceCount + 1);
      neighborCount.set(edge.targetNodeId, targetCount + 1);
      return true;
    })
    .map(edge => ({
      id: edge.id,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      relation: edge.relation,
      weight: edge.weight,
      provenance: edge.provenance,
      reason: edge.reason,
    }));
}

export class KnowledgeGraphService {
  async getGraph(
    userId: string,
    options: { limit?: number; domainSlug?: string | null; isAdmin?: boolean } = {},
  ): Promise<KnowledgeGraph> {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const domainSlug = options.domainSlug ?? null;
    const isAdmin = options.isAdmin ?? false;
    const [memoriesResult, documentsResult] = await Promise.all([
      pool.query<MemoryRow>(
        `SELECT id, conversation_id, summary, key_topics, importance_score,
                domain_slug, emotion, created_at
         FROM conversation_summaries
         WHERE user_id = $1 AND ($2::text IS NULL OR domain_slug = $2)
           AND (domain_slug IS NULL OR $4::boolean OR EXISTS (
             SELECT 1 FROM domains d
             JOIN user_domain_access uda ON uda.domain_id = d.id
             WHERE uda.user_id = $1 AND d.slug = conversation_summaries.domain_slug
           ))
         ORDER BY created_at DESC LIMIT $3`,
        [userId, domainSlug, limit, isAdmin],
      ),
      pool.query<DocumentRow>(
        `SELECT d.id, d.filename, d.domain_slug, d.status, d.metadata, d.uploaded_at,
                cd.source_id, cd.canonical_url, cd.attribution,
                COUNT(dc.id)::int AS chunk_count,
                COALESCE(BOOL_OR(dc.embedding IS NOT NULL), false) AS has_embeddings,
                (ARRAY_AGG(dc.content ORDER BY dc.chunk_index)
                  FILTER (WHERE dc.content IS NOT NULL))[1] AS first_chunk
         FROM documents d
         LEFT JOIN crawler_documents cd ON cd.document_id = d.id
         LEFT JOIN document_chunks dc ON dc.document_id = d.id
         WHERE d.uploaded_by = $1 AND d.status = 'completed'
           AND ($2::text IS NULL OR d.domain_slug = $2)
           AND (d.domain_slug IS NULL OR $4::boolean OR EXISTS (
             SELECT 1 FROM domains domain_access
             JOIN user_domain_access uda ON uda.domain_id = domain_access.id
             WHERE uda.user_id = $1 AND domain_access.slug = d.domain_slug
           ))
         GROUP BY d.id, cd.source_id, cd.canonical_url, cd.attribution
         ORDER BY d.uploaded_at DESC LIMIT $3`,
        [userId, domainSlug, limit, isAdmin],
      ),
    ]);

    const memoryNodes: KnowledgeNode[] = memoriesResult.rows.map(row => ({
      id: `memory:${row.id}`, sourceId: row.id, type: 'memory',
      sourceType: row.conversation_id ? 'conversation' : 'manual',
      label: row.summary.slice(0, 80), summary: row.summary, domainSlug: row.domain_slug,
      importance: row.importance_score, status: null, topics: row.key_topics ?? [],
      canonicalUrl: null, chunkCount: 0, hasEmbeddings: false,
      createdAt: iso(row.created_at), updatedAt: iso(row.created_at),
      metadata: { emotion: row.emotion },
    }));
    const documentNodes: KnowledgeNode[] = documentsResult.rows.map(row => ({
      id: `document:${row.id}`, sourceId: row.id, type: 'document',
      sourceType: row.source_id ? 'crawler' : 'upload', label: row.filename,
      summary: documentSummary(row.first_chunk), domainSlug: row.domain_slug,
      importance: 5, status: row.status, topics: [], canonicalUrl: row.canonical_url,
      chunkCount: Number(row.chunk_count), hasEmbeddings: row.has_embeddings,
      createdAt: iso(row.uploaded_at), updatedAt: iso(row.uploaded_at),
      metadata: { ...(row.metadata ?? {}), sourceId: row.source_id, attribution: row.attribution ?? {} },
    }));
    const nodes = [...memoryNodes, ...documentNodes]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, limit);
    return { nodes, edges: buildKnowledgeEdges(nodes) };
  }
}
