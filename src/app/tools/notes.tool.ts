import { NotesService } from '@/app/services/notes/notes.service';
export { NOTES_TOOL_DEFINITIONS } from './notes.tool.definitions';

export interface NotesUser {
  id: string;
  githubToken?: string | null;
}

export function buildNotesTools(user: NotesUser) {
  const notesService = new NotesService();

  return {
    save_note: async (args: { content: string; title?: string; tags?: string[] }) => {
      const note = await notesService.createNote(user.id, {
        content: args.content,
        title: args.title,
        tags: args.tags ?? [],
        source: 'chat',
      }, user.githubToken);
      return { success: true, note_id: note.id, title: note.title, tags: note.tags };
    },

    query_vault: async (args: { query: string; limit?: number }) => {
      const limit = args.limit ?? 5;
      if (user.githubToken) {
        const results = await notesService.searchNotes(user.id, args.query, user.githubToken, limit);
        if (results.length > 0) return { results };
      }
      const notes = await notesService.keywordSearchNotes(user.id, args.query, limit);
      return { results: notes.map(n => ({ note_id: n.id, title: n.title, content: n.content, tags: n.tags, created_at: n.created_at, similarity: 0 })) };
    },

    list_notes: async (args: { limit?: number; tag?: string }) => {
      const notes = await notesService.listNotes(user.id, { limit: args.limit ?? 10, tag: args.tag });
      return { notes: notes.map(n => ({ note_id: n.id, title: n.title, content: n.content.slice(0, 200), tags: n.tags, created_at: n.created_at })) };
    },

    delete_note: async (args: { note_id: string }) => {
      const deleted = await notesService.deleteNote(user.id, args.note_id);
      return { success: deleted };
    },

    update_note: async (args: { note_id: string; content?: string; title?: string; tags?: string[] }) => {
      const note = await notesService.updateNote(user.id, args.note_id, {
        content: args.content,
        title: args.title,
        tags: args.tags,
      });
      return { success: !!note, note_id: note?.id };
    },
  };
}
