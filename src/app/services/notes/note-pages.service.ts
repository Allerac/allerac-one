import pool from '@/app/clients/db';
import type { Note } from './notes.service';

export class NoteMoveError extends Error {
  constructor(message: string, readonly code: 'not_found' | 'parent_not_found' | 'cycle') {
    super(message);
    this.name = 'NoteMoveError';
  }
}

export interface NoteTreeItem {
  id: string;
  parent_id: string | null;
  title: string | null;
  icon: string | null;
  position: number;
  archived_at: Date | null;
  updated_at: Date;
}

export interface NoteBreadcrumb {
  id: string;
  title: string | null;
  icon: string | null;
}

export interface NoteBacklink {
  note_id: string;
  title: string | null;
  icon: string | null;
  snippet: string;
}

/** Maximum tree depth walked by recursive queries (guards against corrupt data). */
const MAX_TREE_DEPTH = 64;

/**
 * Serialises tree mutations per user so two concurrent moves cannot combine
 * into a cycle that neither would create alone.
 */
async function withUserTreeLock<T>(userId: string, fn: (client: { query: typeof pool.query }) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('user_notes_tree:' || $1))", [userId]);
    const result = await fn(client as unknown as { query: typeof pool.query });
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export class NotePagesService {
  /**
   * Moves a note under a new parent (null = root). Rejects parents owned by
   * another user and any move that would put a note inside its own subtree.
   * When position is omitted the note is appended after its new siblings.
   */
  async moveNote(userId: string, noteId: string, parentId: string | null, position?: number): Promise<Note> {
    return withUserTreeLock(userId, async (db) => {
      const exists = await db.query('SELECT id FROM user_notes WHERE id = $1 AND user_id = $2', [noteId, userId]);
      if (exists.rows.length === 0) throw new NoteMoveError('Note not found', 'not_found');

      if (parentId !== null) {
        if (parentId === noteId) throw new NoteMoveError('A note cannot be its own parent', 'cycle');
        const parent = await db.query('SELECT id FROM user_notes WHERE id = $1 AND user_id = $2', [parentId, userId]);
        if (parent.rows.length === 0) throw new NoteMoveError('Parent note not found', 'parent_not_found');

        // Walk up from the new parent; reaching the moved note means a cycle.
        const ancestors = await db.query(
          `WITH RECURSIVE chain(id, parent_id, depth) AS (
             SELECT id, parent_id, 0 FROM user_notes WHERE id = $1 AND user_id = $2
             UNION ALL
             SELECT n.id, n.parent_id, c.depth + 1
             FROM user_notes n JOIN chain c ON n.id = c.parent_id
             WHERE n.user_id = $2 AND c.depth < ${MAX_TREE_DEPTH}
           )
           SELECT 1 FROM chain WHERE id = $3 LIMIT 1`,
          [parentId, userId, noteId],
        );
        if (ancestors.rows.length > 0) {
          throw new NoteMoveError('Cannot move a note inside its own subtree', 'cycle');
        }
      }

      let targetPosition = position;
      if (targetPosition === undefined || !Number.isFinite(targetPosition)) {
        const max = await db.query(
          `SELECT COALESCE(MAX(position), -1) + 1 AS next
           FROM user_notes
           WHERE user_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND id <> $3`,
          [userId, parentId, noteId],
        );
        targetPosition = Number(max.rows[0]?.next ?? 0);
      } else {
        targetPosition = Math.max(0, Math.floor(targetPosition));
        // Open a slot so siblings keep a stable, gap-tolerant order.
        await db.query(
          `UPDATE user_notes SET position = position + 1
           WHERE user_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND id <> $3 AND position >= $4`,
          [userId, parentId, noteId, targetPosition],
        );
      }

      const res = await db.query(
        `UPDATE user_notes SET parent_id = $1, position = $2, updated_at = NOW()
         WHERE id = $3 AND user_id = $4 RETURNING *`,
        [parentId, targetPosition, noteId, userId],
      );
      return res.rows[0] as Note;
    });
  }

  /** Archives (or restores) a note together with its whole subtree. */
  async setArchived(userId: string, noteId: string, archived: boolean): Promise<number> {
    const res = await pool.query(
      `WITH RECURSIVE subtree(id, depth) AS (
         SELECT id, 0 FROM user_notes WHERE id = $1 AND user_id = $2
         UNION ALL
         SELECT n.id, s.depth + 1 FROM user_notes n JOIN subtree s ON n.parent_id = s.id
         WHERE n.user_id = $2 AND s.depth < ${MAX_TREE_DEPTH}
       )
       UPDATE user_notes SET archived_at = ${archived ? 'COALESCE(archived_at, NOW())' : 'NULL'}
       WHERE user_id = $2 AND id IN (SELECT id FROM subtree)`,
      [noteId, userId],
    );
    return res.rowCount ?? 0;
  }

  /** Lightweight rows for rendering the page tree. */
  async listTree(userId: string, options: { includeArchived?: boolean } = {}): Promise<NoteTreeItem[]> {
    const res = await pool.query(
      `SELECT id, parent_id, title, icon, position, archived_at, updated_at
       FROM user_notes
       WHERE user_id = $1 ${options.includeArchived ? '' : 'AND archived_at IS NULL'}
       ORDER BY position ASC, created_at ASC`,
      [userId],
    );
    return res.rows as NoteTreeItem[];
  }

  async listChildren(userId: string, parentId: string | null, options: { includeArchived?: boolean; limit?: number } = {}): Promise<Note[]> {
    const res = await pool.query(
      `SELECT * FROM user_notes
       WHERE user_id = $1 AND parent_id IS NOT DISTINCT FROM $2
         ${options.includeArchived ? '' : 'AND archived_at IS NULL'}
       ORDER BY position ASC, created_at ASC
       LIMIT $3`,
      [userId, parentId, Math.min(Math.max(options.limit ?? 100, 1), 500)],
    );
    return res.rows as Note[];
  }

  /** Root-first ancestor chain of a note, excluding the note itself. */
  async getBreadcrumbs(userId: string, noteId: string): Promise<NoteBreadcrumb[]> {
    const res = await pool.query(
      `WITH RECURSIVE chain(id, parent_id, title, icon, depth) AS (
         SELECT id, parent_id, title, icon, 0 FROM user_notes WHERE id = $1 AND user_id = $2
         UNION ALL
         SELECT n.id, n.parent_id, n.title, n.icon, c.depth + 1
         FROM user_notes n JOIN chain c ON n.id = c.parent_id
         WHERE n.user_id = $2 AND c.depth < ${MAX_TREE_DEPTH}
       )
       SELECT id, title, icon FROM chain WHERE depth > 0 ORDER BY depth DESC`,
      [noteId, userId],
    );
    return res.rows as NoteBreadcrumb[];
  }
}

export const notePagesService = new NotePagesService();
