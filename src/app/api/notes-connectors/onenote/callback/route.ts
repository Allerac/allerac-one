import { redirect } from 'next/navigation';
import { requireDomainAccess } from '@/app/lib/domain-access';
import { verifyOAuthState } from '@/app/lib/notes-connector-oauth-state';
import { OneNoteConnectorService } from '@/app/services/notes-connectors/onenote-connector.service';
import { NotesConnectorCredentialsService } from '@/app/services/notes-connectors/notes-connector-credentials.service';

const connector = new OneNoteConnectorService();
const credentials = new NotesConnectorCredentialsService('onenote', () => connector.isConfigured(), t => connector.refreshToken(t));

export async function GET(request: Request) {
  const user = await requireDomainAccess('notes');

  const params = new URL(request.url).searchParams;
  const code = params.get('code') ?? '';
  const receivedState = params.get('state') ?? '';

  const stateValid = await verifyOAuthState('onenote', user.id, receivedState);
  if (!code || code.length > 2000 || !stateValid) {
    redirect('/notes?connector=onenote&status=error');
  }

  try {
    const tokens = await connector.exchangeCode(code);
    await credentials.save(user.id, tokens);
  } catch (error) {
    console.error('[NotesConnectors] OneNote OAuth callback failed:', error instanceof Error ? error.message : error);
    redirect('/notes?connector=onenote&status=error');
  }

  redirect('/notes?connector=onenote&status=connected');
}
