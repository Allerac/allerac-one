'use server';

import { NotesService, CreateNoteInput, UpdateNoteInput } from '@/app/services/notes/notes.service';
import { assertDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';
import { noteRelatedService } from '@/app/services/knowledge/note-related.service';
import { promoteMemoryService, PromoteMemoryError } from '@/app/services/knowledge/promote-memory.service';
import { notePagesService, NoteMoveError } from '@/app/services/notes/note-pages.service';
import { noteLinksService } from '@/app/services/notes/note-links.service';

const notesService = new NotesService();

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function createNote(input: CreateNoteInput) {
  try {
    const user = await requireCurrentUser();
    const note = await notesService.createNote(user.id, input);
    return { success: true, note };
  } catch (err: unknown) {
    console.error('[notes] createNote error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function listNotes(options: { limit?: number; tag?: string; due_on?: string; due_before?: string; overdue?: boolean } = {}) {
  try {
    const user = await requireCurrentUser();
    const notes = await notesService.listNotes(user.id, options);
    return { success: true, notes };
  } catch (err: unknown) {
    console.error('[notes] listNotes error:', err);
    return { success: false, notes: [], error: getErrorMessage(err) };
  }
}

export async function searchNotes(query: string) {
  try {
    const user = await requireCurrentUser();
    try {
      const results = await notesService.searchNotes(user.id, query);
      return { success: true, results };
    } catch (embeddingError) {
      console.warn('[notes] Semantic search unavailable, using keyword fallback:', getErrorMessage(embeddingError));
    }
    const notes = await notesService.keywordSearchNotes(user.id, query);
    return { success: true, results: notes.map(n => ({ ...n, note_id: n.id, similarity: 0 })) };
  } catch (err: unknown) {
    console.error('[notes] searchNotes error:', err);
    return { success: false, results: [], error: getErrorMessage(err) };
  }
}

export async function updateNote(noteId: string, input: UpdateNoteInput) {
  try {
    const user = await requireCurrentUser();
    const note = await notesService.updateNote(user.id, noteId, input);
    return { success: !!note, note };
  } catch (err: unknown) {
    console.error('[notes] updateNote error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function deleteNote(noteId: string) {
  try {
    const user = await requireCurrentUser();
    const deleted = await notesService.deleteNote(user.id, noteId);
    return { success: deleted };
  } catch (err: unknown) {
    console.error('[notes] deleteNote error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function getAllTags() {
  try {
    const user = await requireCurrentUser();
    const tags = await notesService.getAllTags(user.id);
    return { success: true, tags };
  } catch (err: unknown) {
    return { success: false, tags: [], error: getErrorMessage(err) };
  }
}

export async function moveNote(noteId: string, parentId: string | null, position?: number) {
  try {
    const user = await requireCurrentUser();
    const note = await notePagesService.moveNote(user.id, noteId, parentId, position);
    return { success: true, note };
  } catch (err: unknown) {
    if (!(err instanceof NoteMoveError)) console.error('[notes] moveNote error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function setNoteArchived(noteId: string, archived: boolean) {
  try {
    const user = await requireCurrentUser();
    const count = await notePagesService.setArchived(user.id, noteId, archived);
    return { success: count > 0, count };
  } catch (err: unknown) {
    console.error('[notes] setNoteArchived error:', err);
    return { success: false, count: 0, error: getErrorMessage(err) };
  }
}

export async function listNoteTree(options: { includeArchived?: boolean } = {}) {
  try {
    const user = await requireCurrentUser();
    const items = await notePagesService.listTree(user.id, options);
    return { success: true, items };
  } catch (err: unknown) {
    console.error('[notes] listNoteTree error:', err);
    return { success: false, items: [], error: getErrorMessage(err) };
  }
}

export async function getNoteBreadcrumbs(noteId: string) {
  try {
    const user = await requireCurrentUser();
    const breadcrumbs = await notePagesService.getBreadcrumbs(user.id, noteId);
    return { success: true, breadcrumbs };
  } catch (err: unknown) {
    return { success: false, breadcrumbs: [], error: getErrorMessage(err) };
  }
}

export async function getNote(noteId: string) {
  try {
    const user = await requireCurrentUser();
    const note = await notesService.getNote(user.id, noteId);
    return { success: !!note, note };
  } catch (err: unknown) {
    return { success: false, note: null, error: getErrorMessage(err) };
  }
}

export async function getNoteBacklinks(noteId: string) {
  try {
    const user = await requireCurrentUser();
    const backlinks = await noteLinksService.getBacklinks(user.id, noteId);
    return { success: true, backlinks };
  } catch (err: unknown) {
    return { success: false, backlinks: [], error: getErrorMessage(err) };
  }
}

export async function getNoteRelated(noteId: string) {
  try {
    const user = await requireCurrentUser();
    await assertDomainAccess(user, 'notes');
    const related = await noteRelatedService.getRelated(user.id, noteId, { isAdmin: user.is_admin });
    return { success: !!related, related };
  } catch (err: unknown) {
    return { success: false, related: null, error: getErrorMessage(err) };
  }
}

export async function promoteMemoryToPage(memoryId: string, options: { parentId?: string | null; title?: string | null } = {}) {
  try {
    const user = await requireCurrentUser();
    await assertDomainAccess(user, 'notes');
    const result = await promoteMemoryService.promote(user, memoryId, options);
    return { success: true, note: result.note, alreadyPromoted: result.alreadyPromoted };
  } catch (err: unknown) {
    if (!(err instanceof PromoteMemoryError) && !(err instanceof NoteMoveError)) {
      console.error('[notes] promoteMemoryToPage error:', err);
    }
    return { success: false, note: null, alreadyPromoted: false, error: getErrorMessage(err) };
  }
}
