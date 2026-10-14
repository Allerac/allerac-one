import pool from '@/app/clients/db';
import { normalizeLinkTitle, parseWikiLinks } from './note-links';

export interface NoteBacklink {
  note_id: string;
  title: string | null;
  icon: string | null;
  snippet: string;
  updated_at: Date;
}

/**
 * Writes note -> note `links_to` rows in knowledge_links from [[Page]]
 * references. Only notes are linked here; tickets intentionally stay out of
 * the knowledge graph.
 */
export class NoteLinksService {
  /** Replaces the outgoing links of a note. Returns the linked note ids. */
  async syncNoteLinks(userId: string, noteId: string, content: string): Promise<string[]> {
    const titles = parseWikiLinks(content).map(normalizeLinkTitle);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM knowledge_links
         WHERE user_id = $1 AND from_type = 'note' AND from_id = $2 AND to_type = 'note' AND relation = 'links_to'`,
        [userId, noteId],
      );
      let targetIds: string[] = [];
      if (titles.length > 0) {
        // Oldest note wins when several share a title; never link to itself.
        const res = await client.query(
          `INSERT INTO knowledge_links (user_id, from_type, from_id, to_type, to_id, relation)
           SELECT $1, 'note', $2, 'note', t.id, 'links_to'
           FROM (
             SELECT DISTINCT ON (lower(regexp_replace(btrim(title), '\\s+', ' ', 'g'))) id
             FROM user_notes
             WHERE user_id = $1 AND id <> $2 AND title IS NOT NULL
               AND lower(regexp_replace(btrim(title), '\\s+', ' ', 'g')) = ANY($3::text[])
             ORDER BY lower(regexp_replace(btrim(title), '\\s+', ' ', 'g')), created_at ASC
           ) t
           ON CONFLICT DO NOTHING
           RETURNING to_id`,
          [userId, noteId, titles],
        );
        targetIds = res.rows.map((r: { to_id: string }) => r.to_id);
      }
      await client.query(
        'UPDATE user_notes SET links_synced_at = NOW() WHERE id = $1 AND user_id = $2',
        [noteId, userId],
      );
      await client.query('COMMIT');
      return targetIds;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Notes that link to the given note (archived sources are hidden). */
  async getBacklinks(userId: string, noteId: string, limit = 50): Promise<NoteBacklink[]> {
    const res = await pool.query(
      `SELECT n.id AS note_id, n.title, n.icon, left(n.content, 200) AS snippet, n.updated_at
       FROM knowledge_links l
       JOIN user_notes n ON n.id = l.from_id AND n.user_id = l.user_id
       WHERE l.user_id = $1 AND l.to_type = 'note' AND l.to_id = $2
         AND l.from_type = 'note' AND n.archived_at IS NULL
       ORDER BY n.updated_at DESC
       LIMIT $3`,
      [userId, noteId, limit],
    );
    return res.rows as NoteBacklink[];
  }

  /**
   * Re-syncs notes that may reference a newly created or renamed title, so
   * [[Page]] links written before the page existed start resolving.
   */
  async resyncReferencesTo(userId: string, title: string | null, excludeNoteId: string, limit = 50): Promise<number> {
    const key = title ? normalizeLinkTitle(title) : '';
    if (!key) return 0;
    const res = await pool.query(
      `SELECT id, content FROM user_notes
       WHERE user_id = $1 AND id <> $2 AND content ILIKE '%[[%' AND position(lower($3) IN lower(content)) > 0
       ORDER BY updated_at DESC
       LIMIT $4`,
      [userId, excludeNoteId, key, limit],
    );
    let count = 0;
    for (const row of res.rows as Array<{ id: string; content: string }>) {
      if (!parseWikiLinks(row.content).some(t => normalizeLinkTitle(t) === key)) continue;
      await this.syncNoteLinks(userId, row.id, row.content);
      count++;
    }
    return count;
  }

  /** Removes every note link that starts or ends at a deleted note. */
  async deleteLinksForNote(userId: string, noteId: string): Promise<void> {
    await pool.query(
      `DELETE FROM knowledge_links
       WHERE user_id = $1 AND ((from_type = 'note' AND from_id = $2) OR (to_type = 'note' AND to_id = $2))`,
      [userId, noteId],
    );
  }
}

export const noteLinksService = new NoteLinksService();
