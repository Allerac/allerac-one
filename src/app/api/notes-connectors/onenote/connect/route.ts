import { redirect } from 'next/navigation';
import { requireDomainAccess } from '@/app/lib/domain-access';
import { createOAuthState } from '@/app/lib/notes-connector-oauth-state';
import { OneNoteConnectorService } from '@/app/services/notes-connectors/onenote-connector.service';

const connector = new OneNoteConnectorService();

export async function GET() {
  const user = await requireDomainAccess('notes');
  if (!connector.isConfigured()) redirect('/notes?connector=onenote&status=not_configured');

  const state = await createOAuthState('onenote', user.id);
  redirect(connector.buildAuthUrl(state));
}
