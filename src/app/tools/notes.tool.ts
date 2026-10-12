import { NotesService } from '@/app/services/notes/notes.service';
import { NotePagesService } from '@/app/services/notes/note-pages.service';

const PAGE_SUMMARY_CHARS = 200;
export { NOTES_TOOL_DEFINITIONS } from './notes.tool.definitions';

export interface NotesUser {
  id: string;
  githubToken?: string | null;
}

export function buildNotesTools(user: NotesUser) {
  const notesService = new NotesService();
  const pagesService = new NotePagesService();

  return {
    save_note: async (args: { content: string; title?: string; tags?: string[]; due_date?: string; parent_id?: string }) => {
      const note = await notesService.createNote(user.id, {
        parent_id: args.parent_id || null,
        content: args.content,
        title: args.title,
        tags: args.tags ?? [],
        source: 'chat',
        due_date: args.due_date ?? null,
      }, user.githubToken);
      return { success: true, note_id: note.id, title: note.title, tags: note.tags, due_date: note.due_date, parent_id: note.parent_id ?? null };
    },

    query_vault: async (args: { query: string; limit?: number }) => {
      const limit = args.limit ?? 5;
      try {
        const results = await notesService.searchNotes(user.id, args.query, null, limit);
        if (results.length > 0) return { results };
      } catch (embeddingError) {
        console.warn('[Notes] Semantic vault search unavailable, using keyword fallback:', embeddingError);
      }
      const notes = await notesService.keywordSearchNotes(user.id, args.query, limit);
      return { results: notes.map(n => ({ note_id: n.id, title: n.title, content: n.content, tags: n.tags, created_at: n.created_at, similarity: 0 })) };
    },

    list_notes: async (args: { limit?: number; tag?: string; due_on?: string; due_before?: string; overdue?: boolean }) => {
      const notes = await notesService.listNotes(user.id, { limit: args.limit ?? 10, tag: args.tag, due_on: args.due_on, due_before: args.due_before, overdue: args.overdue });
      return { notes: notes.map(n => ({ note_id: n.id, title: n.title, content: n.content.slice(0, 200), tags: n.tags, due_date: n.due_date, created_at: n.created_at })) };
    },

    delete_note: async (args: { note_id: string }) => {
      const deleted = await notesService.deleteNote(user.id, args.note_id);
      return { success: deleted };
    },

    update_note: async (args: { note_id: string; content?: string; title?: string; tags?: string[]; due_date?: string | null }) => {
      const note = await notesService.updateNote(user.id, args.note_id, {
        content: args.content,
        title: args.title,
        tags: args.tags,
        // undefined keeps the current due date; null (or an empty string) clears it.
        due_date: args.due_date === undefined ? undefined : (args.due_date || null),
      });
      return { success: !!note, note_id: note?.id };
    },

    get_note: async (args: { note_id: string }) => {
      const note = await notesService.getNote(user.id, args.note_id);
      if (!note) return { success: false, error: 'Note not found' };
      const [breadcrumbs, children] = await Promise.all([
        pagesService.getBreadcrumbs(user.id, note.id),
        pagesService.listChildren(user.id, note.id, { limit: 50 }),
      ]);
      return {
        success: true,
        note: {
          note_id: note.id, title: note.title, content: note.content, tags: note.tags,
          due_date: note.due_date, parent_id: note.parent_id ?? null, archived: !!note.archived_at,
          created_at: note.created_at, updated_at: note.updated_at,
        },
        path: breadcrumbs.map(b => ({ note_id: b.id, title: b.title })),
        children: children.map(c => ({ note_id: c.id, title: c.title })),
      };
    },

    list_children: async (args: { parent_id?: string | null; limit?: number }) => {
      const parentId = args.parent_id || null;
      if (parentId && !(await notesService.getNote(user.id, parentId))) {
        return { success: false, error: 'Parent note not found' };
      }
      const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200);
      const children = await pagesService.listChildren(user.id, parentId, { limit });
      return {
        success: true,
        parent_id: parentId,
        children: children.map(c => ({
          note_id: c.id, title: c.title, content: c.content.slice(0, PAGE_SUMMARY_CHARS), tags: c.tags, updated_at: c.updated_at,
        })),
      };
    },
  };
}
