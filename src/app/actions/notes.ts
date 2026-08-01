'use server';

import { NotesService, CreateNoteInput, UpdateNoteInput } from '@/app/services/notes/notes.service';
import { requireCurrentUser } from '@/app/lib/auth-session';

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
