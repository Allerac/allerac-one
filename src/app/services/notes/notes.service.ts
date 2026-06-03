import pool from '@/app/clients/db';
import { EmbeddingService } from '@/app/services/rag/embedding.service';
import { DocumentService } from '@/app/services/rag/document.service';

export interface Note {
  id: string;
  user_id: string;
  document_id: string | null;
  title: string | null;
  content: string;
  tags: string[];
  source: string;
  due_date: Date | null;
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
}

export interface UpdateNoteInput {
  content?: string;
  title?: string | null;
  tags?: string[];
  due_date?: string | null;
}

export class NotesService {
  async createNote(userId: string, input: CreateNoteInput, githubToken?: string | null): Promise<Note> {
    const { content, title = null, tags = [], source = 'chat', due_date = null } = input;

    let documentId: string | null = null;

    if (githubToken) {
      try {
        const embeddingService = new EmbeddingService(githubToken);
        const documentService = new DocumentService(embeddingService);

        const fakeFile = {
          name: title || content.slice(0, 60).replace(/\n/g, ' '),
          type: 'text/plain',
          size: content.length,
        } as File;

        const docId = await documentService.createDocumentRecord(fakeFile, userId, 'notes');
        documentId = docId;
        documentService.processDocumentContent(docId, content).catch(err => {
          console.error('[Notes] Background embedding failed:', err);
        });
      } catch (err) {
        console.error('[Notes] Failed to create document for note (proceeding without embedding):', err);
      }
    }

    const res = await pool.query(
      `INSERT INTO user_notes (user_id, document_id, title, content, tags, source, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, documentId, title, content, tags, source, due_date ?? null]
    );

    return res.rows[0] as Note;
  }

  async listNotes(userId: string, options: {
    limit?: number;
    tag?: string;
    due_on?: string;
    due_before?: string;
    overdue?: boolean;
  } = {}): Promise<Note[]> {
    const limit = options.limit ?? 20;
    const conditions: string[] = ['user_id = $1'];
    const values: any[] = [userId];
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

  async searchNotes(userId: string, query: string, githubToken: string, limit = 5): Promise<NoteSearchResult[]> {
    const embeddingService = new EmbeddingService(githubToken);
    const { embedding } = await embeddingService.generateEmbedding(query);
    const embeddingStr = `[${embedding.join(',')}]`;

    const res = await pool.query(
      `SELECT
         n.id                                   AS note_id,
         n.title,
         n.content,
         n.tags,
         n.created_at,
         1 - (dc.embedding <=> $1::vector)      AS similarity
       FROM document_chunks dc
       JOIN documents d  ON d.id = dc.document_id
       JOIN user_notes n ON n.document_id = d.id
       WHERE d.uploaded_by = $2
         AND d.domain_slug = 'notes'
         AND d.status = 'completed'
         AND (1 - (dc.embedding <=> $1::vector)) > 0.2
       ORDER BY dc.embedding <=> $1::vector
       LIMIT $3`,
      [embeddingStr, userId, limit]
    );

    return res.rows as NoteSearchResult[];
  }

  async keywordSearchNotes(userId: string, query: string, limit = 5): Promise<Note[]> {
    const res = await pool.query(
      `SELECT * FROM user_notes
       WHERE user_id = $1
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

    if (documentId) {
      await pool.query('DELETE FROM documents WHERE id = $1', [documentId]);
    }

    return true;
  }

  async updateNote(userId: string, noteId: string, input: UpdateNoteInput): Promise<Note | null> {
    const fields: string[] = [];
    const values: any[] = [];
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
    return res.rows[0] ?? null;
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
