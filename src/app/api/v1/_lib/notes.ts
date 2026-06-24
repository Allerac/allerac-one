import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import type { Note, NoteSearchResult } from '@/app/services/notes/notes.service';

const userSettingsService = new UserSettingsService();
const systemSettingsService = new SystemSettingsService();

export async function resolveNotesToken(userId: string): Promise<string | null> {
  const [userSettings, systemSettings] = await Promise.all([
    userSettingsService.loadUserSettings(userId),
    systemSettingsService.loadAll(),
  ]);
  return userSettings?.github_token || systemSettings.github_token || process.env.GITHUB_TOKEN || null;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function noteDto(note: Note) {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    tags: note.tags,
    source: note.source,
    dueDate: iso(note.due_date as unknown as Date | string | null),
    createdAt: iso(note.created_at),
    updatedAt: iso(note.updated_at),
  };
}

export function noteSearchResultDto(r: NoteSearchResult) {
  return {
    id: r.note_id,
    title: r.title,
    content: r.content,
    tags: r.tags,
    similarity: r.similarity,
    createdAt: iso(r.created_at),
  };
}

export function noteFromKeyword(note: Note) {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    tags: note.tags,
    similarity: 0,
    createdAt: iso(note.created_at),
  };
}
