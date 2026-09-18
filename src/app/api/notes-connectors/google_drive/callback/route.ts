import { redirect } from 'next/navigation';
import { requireDomainAccess } from '@/app/lib/domain-access';
import { verifyOAuthState } from '@/app/lib/notes-connector-oauth-state';
import { GoogleDriveConnectorService } from '@/app/services/notes-connectors/google-drive-connector.service';
import { NotesConnectorCredentialsService } from '@/app/services/notes-connectors/notes-connector-credentials.service';

const connector = new GoogleDriveConnectorService();
const credentials = new NotesConnectorCredentialsService('google_drive', () => connector.isConfigured(), t => connector.refreshToken(t));

export async function GET(request: Request) {
  const user = await requireDomainAccess('notes');

  const params = new URL(request.url).searchParams;
  const code = params.get('code') ?? '';
  const receivedState = params.get('state') ?? '';

  const stateValid = await verifyOAuthState('google_drive', user.id, receivedState);
  if (!code || code.length > 2000 || !stateValid) {
    redirect('/notes?connector=google_drive&status=error');
  }

  try {
    const tokens = await connector.exchangeCode(code);
    await credentials.save(user.id, tokens);
  } catch (error) {
    console.error('[NotesConnectors] Google Drive OAuth callback failed:', error instanceof Error ? error.message : error);
    redirect('/notes?connector=google_drive&status=error');
  }

  redirect('/notes?connector=google_drive&status=connected');
}
