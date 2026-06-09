'use server';

import { NotesService, CreateNoteInput, UpdateNoteInput } from '@/app/services/notes/notes.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { requireCurrentUser } from '@/app/lib/auth-session';

const notesService = new NotesService();
const userSettingsService = new UserSettingsService();
const systemSettingsService = new SystemSettingsService();

async function getGithubToken(userId: string): Promise<string | null> {
  const [settings, systemSettings] = await Promise.all([
    userSettingsService.loadUserSettings(userId),
    systemSettingsService.loadAll(),
  ]);
  return settings?.github_token || systemSettings.github_token || process.env.GITHUB_TOKEN || null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function createNote(input: CreateNoteInput) {
  try {
    const user = await requireCurrentUser();
    const githubToken = await getGithubToken(user.id);
    const note = await notesService.createNote(user.id, input, githubToken);
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
    const githubToken = await getGithubToken(user.id);
    if (githubToken) {
      const results = await notesService.searchNotes(user.id, query, githubToken);
      return { success: true, results };
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
