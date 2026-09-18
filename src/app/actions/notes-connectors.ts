'use server';

import { assertDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';
import { GoogleDriveConnectorService } from '@/app/services/notes-connectors/google-drive-connector.service';
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

async function notesUserId(): Promise<string> {
  const user = await requireCurrentUser();
  await assertDomainAccess(user, 'notes');
  return user.id;
}

export async function getGoogleDriveStatus() {
  try {
    return { success: true, status: await googleDriveCredentials.getStatus(await notesUserId()) };
  } catch (err) {
    console.error('[notes-connectors] getGoogleDriveStatus error:', err);
    return { success: false, error: getErrorMessage(err) };
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
 */
export async function importGoogleDriveSelection(files: PickedDriveFile[], accessToken: string) {
  try {
    const userId = await notesUserId();
    const credentialId = await googleDriveCredentials.getCredentialId(userId);
    if (!credentialId) return { success: false, error: 'Google Drive is not connected' };

    const items: NotesConnectorItem[] = [];
    for (const file of files) {
      const details = await googleDrive.describeSelectedFile(accessToken, file.id);
      items.push({ externalId: file.id, title: file.name, ...details });
    }

    const summary = await googleDriveItems.importSelected(userId, credentialId, accessToken, items);
    return { success: true, summary };
  } catch (err) {
    console.error('[notes-connectors] importGoogleDriveSelection error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function resyncGoogleDrive() {
  try {
    const userId = await notesUserId();
    const token = await googleDriveCredentials.getValidAccessToken(userId);
    if (!token) return { success: false, error: 'Google Drive is not connected' };
    const summary = await googleDriveItems.resync(userId, token.credentialId, token.accessToken);
    return { success: true, summary };
  } catch (err) {
    console.error('[notes-connectors] resyncGoogleDrive error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function listGoogleDriveConflicts() {
  try {
    const userId = await notesUserId();
    const token = await googleDriveCredentials.getValidAccessToken(userId);
    if (!token) return { success: false, conflicts: [], error: 'Google Drive is not connected' };
    const conflicts = await googleDriveItems.listConflicts(token.credentialId);
    return { success: true, conflicts };
  } catch (err) {
    console.error('[notes-connectors] listGoogleDriveConflicts error:', err);
    return { success: false, conflicts: [], error: getErrorMessage(err) };
  }
}

export async function resolveGoogleDriveConflict(externalId: string, resolution: 'keep_local' | 'use_source') {
  try {
    const userId = await notesUserId();
    const token = await googleDriveCredentials.getValidAccessToken(userId);
    if (!token) return { success: false, error: 'Google Drive is not connected' };
    await googleDriveItems.resolveConflict(userId, token.credentialId, token.accessToken, externalId, resolution);
    return { success: true };
  } catch (err) {
    console.error('[notes-connectors] resolveGoogleDriveConflict error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

export async function disconnectGoogleDrive() {
  try {
    await googleDriveCredentials.disconnect(await notesUserId());
    return { success: true };
  } catch (err) {
    console.error('[notes-connectors] disconnectGoogleDrive error:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}
