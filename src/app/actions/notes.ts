'use server';

import { NotesService, CreateNoteInput, UpdateNoteInput } from '@/app/services/notes/notes.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';

const notesService = new NotesService();
const userSettingsService = new UserSettingsService();

async function getGithubToken(userId: string): Promise<string | null> {
  const settings = await userSettingsService.loadUserSettings(userId);
  return settings?.github_token ?? null;
}

export async function createNote(userId: string, input: CreateNoteInput) {
  try {
    const githubToken = await getGithubToken(userId);
    const note = await notesService.createNote(userId, input, githubToken);
    return { success: true, note };
  } catch (err: any) {
    console.error('[notes] createNote error:', err);
    return { success: false, error: err.message };
  }
}

export async function listNotes(userId: string, options: { limit?: number; tag?: string; due_on?: string; due_before?: string; overdue?: boolean } = {}) {
  try {
    const notes = await notesService.listNotes(userId, options);
    return { success: true, notes };
  } catch (err: any) {
    console.error('[notes] listNotes error:', err);
    return { success: false, notes: [], error: err.message };
  }
}

export async function searchNotes(userId: string, query: string) {
  try {
    const githubToken = await getGithubToken(userId);
    if (githubToken) {
      const results = await notesService.searchNotes(userId, query, githubToken);
      return { success: true, results };
    }
    const notes = await notesService.keywordSearchNotes(userId, query);
    return { success: true, results: notes.map(n => ({ ...n, note_id: n.id, similarity: 0 })) };
  } catch (err: any) {
    console.error('[notes] searchNotes error:', err);
    return { success: false, results: [], error: err.message };
  }
}

export async function updateNote(userId: string, noteId: string, input: UpdateNoteInput) {
  try {
    const note = await notesService.updateNote(userId, noteId, input);
    return { success: !!note, note };
  } catch (err: any) {
    console.error('[notes] updateNote error:', err);
    return { success: false, error: err.message };
  }
}

export async function deleteNote(userId: string, noteId: string) {
  try {
    const deleted = await notesService.deleteNote(userId, noteId);
    return { success: deleted };
  } catch (err: any) {
    console.error('[notes] deleteNote error:', err);
    return { success: false, error: err.message };
  }
}

export async function getAllTags(userId: string) {
  try {
    const tags = await notesService.getAllTags(userId);
    return { success: true, tags };
  } catch (err: any) {
    return { success: false, tags: [], error: err.message };
  }
}
