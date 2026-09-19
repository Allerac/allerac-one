'use server';

import { assertDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';
import { GoogleDriveConnectorService } from '@/app/services/notes-connectors/google-drive-connector.service';
import { OneNoteConnectorService } from '@/app/services/notes-connectors/onenote-connector.service';
import { NotesConnectorCredentialsService } from '@/app/services/notes-connectors/notes-connector-credentials.service';
import { NotesConnectorItemsService } from '@/app/services/notes-connectors/notes-connector-items.service';
import type { NotesConnectorItem } from '@/app/services/notes-connectors/types';

const googleDrive = new GoogleDriveConnectorService();
const googleDriveCredentials = new NotesConnectorCredentialsService(
  'google_drive',
  () => googleDrive.isConfigured(),
  t => googleDrive.refreshToken(t),
);
const googleDriveItems = new NotesConnectorItemsService('google_drive', googleDrive);

const oneNote = new OneNoteConnectorService();
const oneNoteCredentials = new NotesConnectorCredentialsService(
  'onenote',
  () => oneNote.isConfigured(),
  t => oneNote.refreshToken(t),
);
const oneNoteItems = new NotesConnectorItemsService('onenote', oneNote);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

async function notesUserId(): Promise<string> {
  const user = await requireCurrentUser();
  await assertDomainAccess(user, 'notes');
  return user.id;
}

// ---------------------------------------------------------------------------
// Google Drive
// ---------------------------------------------------------------------------

export async function listGoogleDriveConnections() {
  try {
    const userId = await notesUserId();
    const connections = await googleDriveCredentials.listConnections(userId);
    return { success: true, configured: googleDriveCredentials.isConfigured(), connections };
  } catch (err) {
    console.error('[notes-connectors] listGoogleDriveConnections error:', err);
    return { success: false, configured: false, connections: [], error: getErrorMessage(err) };
  }
}

export interface PickedDriveFile {
  id: string;
  name: string;
}

/**
 * accessToken here is the one the Picker itself just used (minted live via
 * Google Identity Services on the client) — NOT re-fetched from the stored
 * server-side connection. Empirically, a file's per-file drive.file grant is
 * only visible to the exact token/session that was active in the Picker at
 * pick time; the server's independently-refreshed token 404s on files.get
 * even for a file picked moments earlier with the same client_id and user.
 * credentialId ties the import to whichever connected account's card the
 * user clicked "Selecionar e importar" on — the Google account chosen in the
 * Picker's own popup is trusted to match it (not cross-checked).
 */
export async function importGoogleDriveSelection(credentialId: string, files: PickedDriveFile[], accessToken: string) {
  try {
    const userId = await notesUserId();
    const token = await googleDriveCredentials.getValidAccessToken(userId, credentialId);
    if (!token) return { success: false, error: 'Google Drive is not connected' };

    const items: NotesConnectorItem[] = [];
    for (const file of files) {
      const details = await googleDrive.describeSelectedFile(accessToken, file.id);
      items.push({ externalId: file.id, title: file.name, ...details });
    }

    const summary = await googleDriveItems.importSelected(userId, credentialId, accessToken, items);
    await googleDriveCredentials.recordSyncResult(credentialId, summary.failed.length ? `${summary.failed.length} item(s) failed to import` : null);
    return { success: true, summary };
  } catch (err) {
    console.error('[notes-connectors] importGoogleDriveSelection error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function resyncGoogleDrive(credentialId: string) {
  try {
    const userId = await notesUserId();
    const token = await googleDriveCredentials.getValidAccessToken(userId, credentialId);
    if (!token) return { success: false, error: 'Google Drive is not connected' };
    const summary = await googleDriveItems.resync(userId, credentialId, token.accessToken);
    await googleDriveCredentials.recordSyncResult(credentialId, summary.failed.length ? `${summary.failed.length} item(s) failed to sync` : null);
    return { success: true, summary };
  } catch (err) {
    console.error('[notes-connectors] resyncGoogleDrive error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function listGoogleDriveConflicts(credentialId: string) {
  try {
    const conflicts = await googleDriveItems.listConflicts(credentialId);
    return { success: true, conflicts };
  } catch (err) {
    console.error('[notes-connectors] listGoogleDriveConflicts error:', err);
    return { success: false, conflicts: [], error: getErrorMessage(err) };
  }
}

export async function resolveGoogleDriveConflict(credentialId: string, externalId: string, resolution: 'keep_local' | 'use_source') {
  try {
    const userId = await notesUserId();
    const token = await googleDriveCredentials.getValidAccessToken(userId, credentialId);
    if (!token) return { success: false, error: 'Google Drive is not connected' };
    await googleDriveItems.resolveConflict(userId, credentialId, token.accessToken, externalId, resolution);
    return { success: true };
  } catch (err) {
    console.error('[notes-connectors] resolveGoogleDriveConflict error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function disconnectGoogleDrive(credentialId: string) {
  try {
    const userId = await notesUserId();
    await googleDriveCredentials.disconnect(userId, credentialId);
    return { success: true };
  } catch (err) {
    console.error('[notes-connectors] disconnectGoogleDrive error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// OneNote
// ---------------------------------------------------------------------------

export async function listOneNoteConnections() {
  try {
    const userId = await notesUserId();
    const connections = await oneNoteCredentials.listConnections(userId);
    return { success: true, configured: oneNoteCredentials.isConfigured(), connections };
  } catch (err) {
    console.error('[notes-connectors] listOneNoteConnections error:', err);
    return { success: false, configured: false, connections: [], error: getErrorMessage(err) };
  }
}

/** Powers the notebook/section/page checkbox tree — OneNote has no client-side picker equivalent to Google's. */
export async function getOneNoteItems(credentialId: string) {
  try {
    const userId = await notesUserId();
    const token = await oneNoteCredentials.getValidAccessToken(userId, credentialId);
    if (!token) return { success: false, items: [] as NotesConnectorItem[], error: 'OneNote is not connected' };
    const items: NotesConnectorItem[] = [];
    for await (const item of oneNote.listItems(token.accessToken)) items.push(item);
    return { success: true, items };
  } catch (err) {
    console.error('[notes-connectors] getOneNoteItems error:', err);
    return { success: false, items: [] as NotesConnectorItem[], error: getErrorMessage(err) };
  }
}

/** Selected items already carry full metadata from getOneNoteItems — no per-item lookup needed, unlike Google's Picker result. */
export async function importOneNoteSelection(credentialId: string, items: NotesConnectorItem[]) {
  try {
    const userId = await notesUserId();
    const token = await oneNoteCredentials.getValidAccessToken(userId, credentialId);
    if (!token) return { success: false, error: 'OneNote is not connected' };
    const summary = await oneNoteItems.importSelected(userId, credentialId, token.accessToken, items);
    await oneNoteCredentials.recordSyncResult(credentialId, summary.failed.length ? `${summary.failed.length} item(s) failed to import` : null);
    return { success: true, summary };
  } catch (err) {
    console.error('[notes-connectors] importOneNoteSelection error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function resyncOneNote(credentialId: string) {
  try {
    const userId = await notesUserId();
    const token = await oneNoteCredentials.getValidAccessToken(userId, credentialId);
    if (!token) return { success: false, error: 'OneNote is not connected' };
    const summary = await oneNoteItems.resync(userId, credentialId, token.accessToken);
    await oneNoteCredentials.recordSyncResult(credentialId, summary.failed.length ? `${summary.failed.length} item(s) failed to sync` : null);
    return { success: true, summary };
  } catch (err) {
    console.error('[notes-connectors] resyncOneNote error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function listOneNoteConflicts(credentialId: string) {
  try {
    const conflicts = await oneNoteItems.listConflicts(credentialId);
    return { success: true, conflicts };
  } catch (err) {
    console.error('[notes-connectors] listOneNoteConflicts error:', err);
    return { success: false, conflicts: [], error: getErrorMessage(err) };
  }
}

export async function resolveOneNoteConflict(credentialId: string, externalId: string, resolution: 'keep_local' | 'use_source') {
  try {
    const userId = await notesUserId();
    const token = await oneNoteCredentials.getValidAccessToken(userId, credentialId);
    if (!token) return { success: false, error: 'OneNote is not connected' };
    await oneNoteItems.resolveConflict(userId, credentialId, token.accessToken, externalId, resolution);
    return { success: true };
  } catch (err) {
    console.error('[notes-connectors] resolveOneNoteConflict error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function disconnectOneNote(credentialId: string) {
  try {
    const userId = await notesUserId();
    await oneNoteCredentials.disconnect(userId, credentialId);
    return { success: true };
  } catch (err) {
    console.error('[notes-connectors] disconnectOneNote error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}
