import pool from '@/app/clients/db';

/**
 * "Related" items for a note page:
 * - notes and documents ranked by vector similarity to the note's own
 *   embedded chunks (no new embedding call: the note's chunk vectors are
 *   averaged in SQL);
 * - memories matched lexically (memories have no embeddings yet), by shared
 *   tags/topics or by the note title appearing in the memory;
 * - memories this note was promoted from (derived_from links).
 * Tickets are never queried. Archived notes are never returned.
 */

export interface RelatedNote { note_id: string; title: string | null; icon: string | null; snippet: string; similarity: number }
export interface RelatedDocument { document_id: string; filename: string; domain_slug: string | null; similarity: number }
export interface RelatedMemory {
  memory_id: string; summary: string; key_topics: string[]; domain_slug: string | null;
  created_at: Date; reason: 'derived_from' | 'shared_topic' | 'mentions_title';
}

export interface NoteRelated {
  semanticAvailable: boolean;
  notes: RelatedNote[];
  documents: RelatedDocument[];
  memories: RelatedMemory[];
}

export const RELATED_MIN_SIMILARITY = 0.35;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

/** Domain gate shared with the Knowledge graph: NULL domain, admin, or user_domain_access. */
export function domainAccessSql(column: string, userParam: string, adminParam: string): string {
  return `(${column} IS NULL OR ${adminParam}::boolean OR EXISTS (
    SELECT 1 FROM domains dom JOIN user_domain_access uda ON uda.domain_id = dom.id
    WHERE uda.user_id = ${userParam} AND dom.slug = ${column}))`;
}

const NOTE_VECTOR_CTE = `
  WITH src AS (
    SELECT AVG(dc.embedding) AS v
    FROM user_notes n
    JOIN documents d ON d.id = n.document_id AND d.uploaded_by = n.user_id AND d.status = 'completed'
    JOIN document_chunks dc ON dc.document_id = d.id
    WHERE n.id = $2 AND n.user_id = $1 AND dc.embedding IS NOT NULL
  )`;

export class NoteRelatedService {
  async getRelated(
    userId: string,
    noteId: string,
    options: { limit?: number; isAdmin?: boolean } = {},
  ): Promise<NoteRelated | null> {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const isAdmin = options.isAdmin ?? false;

    const noteRes = await pool.query(
      `SELECT n.id, n.title, n.tags,
              EXISTS (
                SELECT 1 FROM documents d JOIN document_chunks dc ON dc.document_id = d.id
                WHERE d.id = n.document_id AND d.uploaded_by = n.user_id
                  AND d.status = 'completed' AND dc.embedding IS NOT NULL
              ) AS has_vector
       FROM user_notes n WHERE n.id = $1 AND n.user_id = $2`,
      [noteId, userId],
    );
    const note = noteRes.rows[0] as { id: string; title: string | null; tags: string[] | null; has_vector: boolean } | undefined;
    if (!note) return null;

    const [notes, documents, memories] = await Promise.all([
      note.has_vector ? this.relatedNotes(userId, noteId, limit) : Promise.resolve([]),
      note.has_vector ? this.relatedDocuments(userId, noteId, limit, isAdmin) : Promise.resolve([]),
      this.relatedMemories(userId, noteId, note.title, note.tags ?? [], limit, isAdmin),
    ]);
    return { semanticAvailable: note.has_vector, notes, documents, memories };
  }

  private async relatedNotes(userId: string, noteId: string, limit: number): Promise<RelatedNote[]> {
    const res = await pool.query(
      `${NOTE_VECTOR_CTE}
       SELECT note_id, title, icon, snippet, similarity FROM (
         SELECT DISTINCT ON (n.id)
           n.id AS note_id, n.title, n.icon, left(n.content, 160) AS snippet,
           1 - (dc.embedding <=> src.v) AS similarity
         FROM src
         JOIN document_chunks dc ON true
         JOIN documents d ON d.id = dc.document_id
         JOIN user_notes n ON n.document_id = d.id AND n.user_id = d.uploaded_by
         WHERE src.v IS NOT NULL AND d.uploaded_by = $1 AND d.source_type = 'note'
           AND d.status = 'completed' AND dc.embedding IS NOT NULL
           AND n.id <> $2 AND n.archived_at IS NULL
         ORDER BY n.id, dc.embedding <=> src.v
       ) best
       WHERE similarity >= $4
       ORDER BY similarity DESC
       LIMIT $3`,
      [userId, noteId, limit, RELATED_MIN_SIMILARITY],
    );
    return res.rows as RelatedNote[];
  }

  private async relatedDocuments(userId: string, noteId: string, limit: number, isAdmin: boolean): Promise<RelatedDocument[]> {
    const res = await pool.query(
      `${NOTE_VECTOR_CTE}
       SELECT document_id, filename, domain_slug, similarity FROM (
         SELECT DISTINCT ON (d.id)
           d.id AS document_id, d.filename, d.domain_slug,
           1 - (dc.embedding <=> src.v) AS similarity
         FROM src
         JOIN document_chunks dc ON true
         JOIN documents d ON d.id = dc.document_id
         WHERE src.v IS NOT NULL AND d.uploaded_by = $1 AND d.source_type <> 'note'
           AND d.status = 'completed' AND dc.embedding IS NOT NULL
           AND ${domainAccessSql('d.domain_slug', '$1', '$5')}
         ORDER BY d.id, dc.embedding <=> src.v
       ) best
       WHERE similarity >= $4
       ORDER BY similarity DESC
       LIMIT $3`,
      [userId, noteId, limit, RELATED_MIN_SIMILARITY, isAdmin],
    );
    return res.rows as RelatedDocument[];
  }

  private async relatedMemories(
    userId: string, noteId: string, title: string | null, tags: string[], limit: number, isAdmin: boolean,
  ): Promise<RelatedMemory[]> {
    const normalizedTags = [...new Set(tags.map(t => t.trim().toLowerCase()).filter(Boolean))];
    const trimmedTitle = title?.trim() ?? '';
    // Very short titles ("To do") would match almost anything.
    const titlePattern = trimmedTitle.length >= 4 ? `%${trimmedTitle.replace(/[\\%_]/g, m => `\\${m}`)}%` : null;
    const res = await pool.query(
      `SELECT cs.id AS memory_id, cs.summary, COALESCE(cs.key_topics, '{}') AS key_topics,
              cs.domain_slug, cs.created_at,
              CASE
                WHEN l.from_id IS NOT NULL THEN 'derived_from'
                WHEN EXISTS (SELECT 1 FROM unnest(COALESCE(cs.key_topics, '{}')) t WHERE lower(t) = ANY($3::text[])) THEN 'shared_topic'
                ELSE 'mentions_title'
              END AS reason
       FROM conversation_summaries cs
       LEFT JOIN knowledge_links l
         ON l.user_id = $1 AND l.from_type = 'note' AND l.from_id = $2
        AND l.to_type = 'memory' AND l.to_id = cs.id AND l.relation = 'derived_from'
       WHERE cs.user_id = $1
         AND ${domainAccessSql('cs.domain_slug', '$1', '$6')}
         AND (
           l.from_id IS NOT NULL
           OR EXISTS (SELECT 1 FROM unnest(COALESCE(cs.key_topics, '{}')) t WHERE lower(t) = ANY($3::text[]))
           OR ($4::text IS NOT NULL AND cs.summary ILIKE $4)
         )
       ORDER BY (l.from_id IS NOT NULL) DESC, cs.importance_score DESC, cs.created_at DESC
       LIMIT $5`,
      [userId, noteId, normalizedTags, titlePattern, limit, isAdmin],
    );
    return res.rows as RelatedMemory[];
  }
}

export const noteRelatedService = new NoteRelatedService();
