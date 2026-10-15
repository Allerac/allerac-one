import pool from '@/app/clients/db';
import { isDomainEnabled } from '@/modules/registry';
import { KnowledgeEdge, KnowledgeGraph, KnowledgeNode } from './knowledge-graph.types';

const NOTES_DOMAIN = 'notes';

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

interface NoteRow {
  id: string; title: string | null; content: string; tags: string[] | null;
  parent_id: string | null; icon: string | null; source: string;
  archived_at: Date | string | null; created_at: Date | string; updated_at: Date | string;
}

interface NoteLinkRow { from_id: string; to_id: string; to_type?: string; relation?: string }

function noteLabel(row: Pick<NoteRow, 'title' | 'content'>): string {
  const title = row.title?.trim();
  if (title) return title.slice(0, 80);
  const firstLine = row.content.replace(/\s+/g, ' ').trim().slice(0, 80);
  return firstLine || 'Untitled';
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Explicit note edges: [[Page]] links (links_to) and the page hierarchy
 * (child_of). Only edges whose two ends are in the node set are returned.
 */
export function buildNoteEdges(nodes: KnowledgeNode[], links: NoteLinkRow[]): KnowledgeEdge[] {
  const ids = new Set(nodes.map(n => n.id));
  const labels = new Map(nodes.map(n => [n.id, n.label]));
  const seen = new Set<string>();
  const edges: KnowledgeEdge[] = [];
  for (const link of links) {
    // Only note->note links and note->memory provenance; any other target
    // type (tickets in particular) never becomes an edge.
    const derived = link.relation === 'derived_from' && link.to_type === 'memory';
    if (!derived && (link.to_type ?? 'note') !== 'note') continue;
    const from = `note:${link.from_id}`;
    const to = derived ? `memory:${link.to_id}` : `note:${link.to_id}`;
    if (from === to || !ids.has(from) || !ids.has(to)) continue;
    const relation = derived ? 'derived_from' : 'links_to';
    const id = `${relation}:${from}:${to}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({
      id, sourceNodeId: from, targetNodeId: to, relation, weight: 1, provenance: 'user',
      reason: derived ? 'Promoted from this memory' : `Links to [[${labels.get(to)}]]`,
    });
  }
  for (const node of nodes) {
    const parentId = node.type === 'note' ? node.metadata.parentId : null;
    if (typeof parentId !== 'string') continue;
    const parent = `note:${parentId}`;
    if (!ids.has(parent) || parent === node.id) continue;
    edges.push({
      id: `child_of:${node.id}:${parent}`, sourceNodeId: node.id, targetNodeId: parent,
      relation: 'child_of', weight: 0.9, provenance: 'user',
      reason: `Sub-page of ${labels.get(parent)}`,
    });
  }
  return edges;
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

function documentSummary(content: string | null): string | null {
  if (!content) return null;
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.length > 320 ? `${normalized.slice(0, 317)}…` : normalized;
}

export function buildKnowledgeEdges(nodes: KnowledgeNode[], skipPairs: Set<string> = new Set()): KnowledgeEdge[] {
  const candidates: Array<KnowledgeEdge & { priority: number }> = [];
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const left = nodes[leftIndex];
      const right = nodes[rightIndex];
      if (skipPairs.has(pairKey(left.id, right.id))) continue;
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
    options: { limit?: number; domainSlug?: string | null; isAdmin?: boolean; includeArchivedNotes?: boolean } = {},
  ): Promise<KnowledgeGraph> {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const domainSlug = options.domainSlug ?? null;
    const isAdmin = options.isAdmin ?? false;
    const includeNotes = (domainSlug === null || domainSlug === NOTES_DOMAIN) && isDomainEnabled(NOTES_DOMAIN);
    const [memoriesResult, documentsResult, notesResult] = await Promise.all([
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
           AND d.source_type <> 'note'
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
      // Notes are projected from user_notes (never from their hidden index
      // documents), gated by the same notes-domain access as the /notes page.
      includeNotes
        ? pool.query<NoteRow>(
          `SELECT n.id, n.title, n.content, n.tags, n.parent_id, n.icon, n.source,
                  n.archived_at, n.created_at, n.updated_at
           FROM user_notes n
           WHERE n.user_id = $1
             AND ($3::boolean OR n.archived_at IS NULL)
             AND ($4::boolean OR EXISTS (
               SELECT 1 FROM domains d
               JOIN user_domain_access uda ON uda.domain_id = d.id
               WHERE uda.user_id = $1 AND d.slug = 'notes' AND d.is_active = true
             ))
           ORDER BY n.updated_at DESC LIMIT $2`,
          [userId, limit, options.includeArchivedNotes ?? false, isAdmin],
        )
        : Promise.resolve({ rows: [] as NoteRow[] }),
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
    const noteNodes: KnowledgeNode[] = notesResult.rows.map(row => ({
      id: `note:${row.id}`, sourceId: row.id, type: 'note', sourceType: 'note',
      label: noteLabel(row), summary: documentSummary(row.content), domainSlug: NOTES_DOMAIN,
      importance: 5, status: row.archived_at ? 'archived' : null, topics: row.tags ?? [],
      canonicalUrl: null, chunkCount: 0, hasEmbeddings: false,
      createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
      metadata: { parentId: row.parent_id, icon: row.icon, noteSource: row.source },
    }));
    const nodes = [...memoryNodes, ...documentNodes, ...noteNodes]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, limit);

    const keptNoteIds = nodes.filter(n => n.type === 'note').map(n => n.sourceId);
    const keptMemoryIds = nodes.filter(n => n.type === 'memory').map(n => n.sourceId);
    const links = keptNoteIds.length > 1
      ? (await pool.query<NoteLinkRow>(
        `SELECT from_id, to_id, to_type, relation FROM knowledge_links
         WHERE user_id = $1 AND from_type = 'note' AND to_type = 'note' AND relation = 'links_to'
           AND from_id = ANY($2::uuid[]) AND to_id = ANY($2::uuid[])`,
        [userId, keptNoteIds],
      )).rows
      : [];
    if (keptNoteIds.length > 0 && keptMemoryIds.length > 0) {
      links.push(...(await pool.query<NoteLinkRow>(
        `SELECT from_id, to_id, to_type, relation FROM knowledge_links
         WHERE user_id = $1 AND from_type = 'note' AND to_type = 'memory' AND relation = 'derived_from'
           AND from_id = ANY($2::uuid[]) AND to_id = ANY($3::uuid[])`,
        [userId, keptNoteIds, keptMemoryIds],
      )).rows);
    }
    // Explicit, user-authored edges come first; deterministic ones only fill
    // in pairs that are not already explicitly connected.
    const explicit = buildNoteEdges(nodes, links);
    const explicitPairs = new Set(explicit.map(e => pairKey(e.sourceNodeId, e.targetNodeId)));
    return { nodes, edges: [...explicit, ...buildKnowledgeEdges(nodes, explicitPairs)] };
  }
}
