import pool from '@/app/clients/db';
import { EmbeddingService } from '@/app/services/rag/embedding.service';
import { DocumentService } from '@/app/services/rag/document.service';
import { noteLinksService } from './note-links.service';
import { NoteMoveError } from './note-pages.service';
import {
  NoteReindexQueue,
  buildNoteIndexText,
  hashNoteIndexText,
  noteDocumentName,
} from './note-reindex-queue';

export interface Note {
  id: string;
  user_id: string;
  document_id: string | null;
  title: string | null;
  content: string;
  tags: string[];
  source: string;
  due_date: Date | null;
  content_hash?: string | null;
  parent_id?: string | null;
  position?: number;
  icon?: string | null;
  archived_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface NoteSearchResult {
  note_id: string;
  title: string | null;
  content: string;
  tags: string[];
  similarity: number;
  created_at: Date;
}

export interface CreateNoteInput {
  content: string;
  title?: string;
  tags?: string[];
  source?: string;
  due_date?: string | null;
  /** Parent page; must belong to the same user. Omit or null for the root. */
  parent_id?: string | null;
}

export interface UpdateNoteInput {
  content?: string;
  title?: string | null;
  tags?: string[];
  due_date?: string | null;
}

export class NotesService {
  async createNote(userId: string, input: CreateNoteInput, legacyGithubToken?: string | null): Promise<Note> {
    void legacyGithubToken;
    const { content, title = null, tags = [], source = 'chat', due_date = null, parent_id = null } = input;

    let position = 0;
    if (parent_id) {
      const parent = await pool.query(
        `SELECT COALESCE((SELECT MAX(position) + 1 FROM user_notes WHERE user_id = $2 AND parent_id = $1), 0) AS next
         FROM user_notes WHERE id = $1 AND user_id = $2`,
        [parent_id, userId],
      );
      if (parent.rows.length === 0) throw new NoteMoveError('Parent note not found', 'parent_not_found');
      position = Number(parent.rows[0].next ?? 0);
    }

    let documentId: string | null = null;
    const indexText = buildNoteIndexText(title, content);
    let contentHash: string | null = null;

    try {
      const embeddingService = new EmbeddingService();
      const documentService = new DocumentService(embeddingService);

      const fakeFile = {
        name: noteDocumentName(title, content),
        type: 'text/plain',
        size: indexText.length,
      } as File;

      const docId = await documentService.createDocumentRecord(fakeFile, userId, 'notes', { type: 'note' });
      documentId = docId;
      contentHash = hashNoteIndexText(indexText);
      documentService.processDocumentContent(docId, indexText).catch(err => {
        console.error('[Notes] Background embedding failed:', err);
      });
    } catch (err) {
      console.error('[Notes] Failed to create document for note (proceeding without embedding):', err);
    }

    const res = await pool.query(
      `INSERT INTO user_notes (user_id, document_id, title, content, tags, source, due_date, content_hash, parent_id, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [userId, documentId, title, content, tags, source, due_date ?? null, contentHash, parent_id, position]
    );

    if (documentId) {
      await pool.query(
        'UPDATE documents SET source_id = $1 WHERE id = $2 AND uploaded_by = $3',
        [res.rows[0].id, documentId, userId],
      ).catch((err: unknown) => console.error('[Notes] Failed to link note document:', err));
    }

    const created = res.rows[0] as Note;
    await updateNoteLinks(userId, created.id, { content, title, titleChanged: !!title });
    return created;
  }

  async getNote(userId: string, noteId: string): Promise<Note | null> {
    const res = await pool.query('SELECT * FROM user_notes WHERE id = $1 AND user_id = $2', [noteId, userId]);
    return (res.rows[0] as Note | undefined) ?? null;
  }

  async listNotes(userId: string, options: {
    limit?: number;
    tag?: string;
    due_on?: string;
    due_before?: string;
    overdue?: boolean;
    includeArchived?: boolean;
  } = {}): Promise<Note[]> {
    const limit = options.limit ?? 20;
    const conditions: string[] = ['user_id = $1'];
    if (!options.includeArchived) conditions.push('archived_at IS NULL');
    const values: unknown[] = [userId];
    let i = 2;

    if (options.tag) {
      conditions.push(`$${i++} = ANY(tags)`);
      values.push(options.tag);
    }
    if (options.due_on) {
      conditions.push(`due_date::date = $${i++}::date`);
      values.push(options.due_on);
    } else if (options.due_before) {
      conditions.push(`due_date::date <= $${i++}::date`);
      values.push(options.due_before);
    } else if (options.overdue) {
      conditions.push(`due_date < NOW()`);
    }

    values.push(limit);
    const res = await pool.query(
      `SELECT * FROM user_notes
       WHERE ${conditions.join(' AND ')}
       ORDER BY CASE WHEN due_date IS NOT NULL THEN 0 ELSE 1 END, due_date ASC, created_at DESC
       LIMIT $${i}`,
      values
    );
    return res.rows as Note[];
  }

  async searchNotes(userId: string, query: string, _legacyGithubToken?: string | null, limit = 5): Promise<NoteSearchResult[]> {
    const embeddingService = new EmbeddingService();
    const { embedding } = await embeddingService.generateEmbedding(query);
    const embeddingStr = `[${embedding.join(',')}]`;

    // One row per note: keep each note's best-matching chunk, then rank notes.
    const res = await pool.query(
      `SELECT note_id, title, content, tags, created_at, similarity
       FROM (
         SELECT DISTINCT ON (n.id)
           n.id                                   AS note_id,
           n.title,
           n.content,
           n.tags,
           n.created_at,
           1 - (dc.embedding <=> $1::vector)      AS similarity
         FROM document_chunks dc
         JOIN documents d  ON d.id = dc.document_id
         JOIN user_notes n ON n.document_id = d.id AND n.user_id = d.uploaded_by
         WHERE d.uploaded_by = $2
           AND n.archived_at IS NULL
           AND d.domain_slug = 'notes'
           AND d.status = 'completed'
           AND dc.embedding IS NOT NULL
           AND (1 - (dc.embedding <=> $1::vector)) > 0.2
         ORDER BY n.id, dc.embedding <=> $1::vector
       ) best_per_note
       ORDER BY similarity DESC, created_at DESC
       LIMIT $3`,
      [embeddingStr, userId, limit]
    );

    return res.rows as NoteSearchResult[];
  }

  async keywordSearchNotes(userId: string, query: string, limit = 5): Promise<Note[]> {
    const res = await pool.query(
      `SELECT * FROM user_notes
       WHERE user_id = $1
         AND archived_at IS NULL
         AND (content ILIKE $2 OR title ILIKE $2 OR $3 ILIKE ANY(tags))
       ORDER BY created_at DESC
       LIMIT $4`,
      [userId, `%${query}%`, query, limit]
    );
    return res.rows as Note[];
  }

  async deleteNote(userId: string, noteId: string): Promise<boolean> {
    const noteRes = await pool.query(
      'SELECT document_id FROM user_notes WHERE id = $1 AND user_id = $2',
      [noteId, userId]
    );
    if (noteRes.rows.length === 0) return false;

    const documentId = noteRes.rows[0].document_id;

    await pool.query('DELETE FROM user_notes WHERE id = $1 AND user_id = $2', [noteId, userId]);
    noteReindexQueue.cancel(noteId);

    if (documentId) {
      await pool.query(
        'DELETE FROM documents WHERE id = $1 AND uploaded_by = $2',
        [documentId, userId]
      );
    }

    try {
      await noteLinksService.deleteLinksForNote(userId, noteId);
    } catch (err) {
      console.error('[Notes] Failed to delete note links:', err);
    }

    return true;
  }

  async updateNote(userId: string, noteId: string, input: UpdateNoteInput): Promise<Note | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (input.content !== undefined)   { fields.push(`content = $${i++}`);   values.push(input.content); }
    if (input.title !== undefined)     { fields.push(`title = $${i++}`);     values.push(input.title); }
    if (input.tags !== undefined)      { fields.push(`tags = $${i++}`);      values.push(input.tags); }
    if (input.due_date !== undefined)  { fields.push(`due_date = $${i++}`);  values.push(input.due_date ?? null); }

    if (fields.length === 0) return null;

    fields.push(`updated_at = NOW()`);
    values.push(noteId, userId);

    const res = await pool.query(
      `UPDATE user_notes SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i++} RETURNING *`,
      values
    );
    const note = res.rows[0] as Note | undefined;
    if (!note) return null;

    // Title and content are both part of the indexed text. Re-embedding runs in
    // the background (debounced) and is skipped when the text hash is unchanged.
    if (input.content !== undefined || input.title !== undefined) {
      noteReindexQueue.schedule(userId, note.id);
    }
    if (input.content !== undefined || input.title !== undefined) {
      await updateNoteLinks(userId, note.id, {
        content: input.content !== undefined ? note.content : undefined,
        title: note.title,
        titleChanged: input.title !== undefined,
      });
    }

    return note;
  }

  /**
   * Re-embeds one note if its indexed text (title + content) changed since the
   * last successful embedding, or if its document is missing or not completed.
   */
  async reindexNote(userId: string, noteId: string): Promise<'reindexed' | 'skipped' | 'missing' | 'failed'> {
    const res = await pool.query(
      `SELECT n.id, n.title, n.content, n.document_id, n.content_hash, d.status AS document_status
       FROM user_notes n
       LEFT JOIN documents d ON d.id = n.document_id AND d.uploaded_by = n.user_id
       WHERE n.id = $1 AND n.user_id = $2`,
      [noteId, userId],
    );
    const row = res.rows[0] as {
      id: string; title: string | null; content: string; document_id: string | null;
      content_hash: string | null; document_status: string | null;
    } | undefined;
    if (!row) return 'missing';

    const indexText = buildNoteIndexText(row.title, row.content);
    const hash = hashNoteIndexText(indexText);
    if (row.document_id && row.document_status === 'completed' && row.content_hash === hash) {
      return 'skipped';
    }

    const documentService = new DocumentService(new EmbeddingService());
    const name = noteDocumentName(row.title, row.content);
    let documentId = row.document_status ? row.document_id : null;
    if (documentId) {
      await pool.query(
        'UPDATE documents SET filename = $1, file_size = $2 WHERE id = $3 AND uploaded_by = $4',
        [name, indexText.length, documentId, userId],
      );
      await documentService.reprocessDocumentContent(documentId, indexText);
    } else {
      // The note never got a document (e.g. the embedding backend was down at creation).
      documentId = await documentService.createDocumentRecord(
        { name, type: 'text/plain', size: indexText.length } as File,
        userId,
        'notes',
        { type: 'note', id: row.id },
      );
      await pool.query(
        'UPDATE user_notes SET document_id = $1 WHERE id = $2 AND user_id = $3',
        [documentId, row.id, userId],
      );
      await documentService.processDocumentContent(documentId, indexText);
    }

    const status = await pool.query(
      'SELECT status FROM documents WHERE id = $1 AND uploaded_by = $2',
      [documentId, userId],
    );
    if (status.rows[0]?.status !== 'completed') return 'failed';

    // Record the hash of the text that was embedded; updated_at is left alone.
    await pool.query(
      'UPDATE user_notes SET content_hash = $1 WHERE id = $2 AND user_id = $3',
      [hash, row.id, userId],
    );
    return 'reindexed';
  }

  async getAllTags(userId: string): Promise<string[]> {
    const res = await pool.query(
      `SELECT DISTINCT unnest(tags) AS tag
       FROM user_notes
       WHERE user_id = $1
       ORDER BY tag`,
      [userId]
    );
    return res.rows.map(r => r.tag);
  }
}

/**
 * Keeps knowledge_links in sync after a save. Link maintenance never fails the
 * save itself: a missing table or a transient error only logs.
 */
async function updateNoteLinks(
  userId: string,
  noteId: string,
  change: { content?: string; title: string | null; titleChanged: boolean },
): Promise<void> {
  try {
    if (change.content !== undefined) await noteLinksService.syncNoteLinks(userId, noteId, change.content);
    if (change.titleChanged) {
      // Can touch many notes, so it runs after the save returns.
      noteLinksService.resyncReferencesTo(userId, change.title, noteId).catch(err => {
        console.error('[Notes] Failed to resync references to renamed note:', err);
      });
    }
  } catch (err) {
    console.error('[Notes] Failed to update note links:', err);
  }
}

export const noteReindexQueue = new NoteReindexQueue(
  (userId, noteId) => new NotesService().reindexNote(userId, noteId),
);
