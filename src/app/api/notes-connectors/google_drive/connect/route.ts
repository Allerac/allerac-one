import { redirect } from 'next/navigation';
import { requireDomainAccess } from '@/app/lib/domain-access';
import { createOAuthState } from '@/app/lib/notes-connector-oauth-state';
import { GoogleDriveConnectorService } from '@/app/services/notes-connectors/google-drive-connector.service';

const connector = new GoogleDriveConnectorService();

export async function GET() {
  const user = await requireDomainAccess('notes');
  if (!connector.isConfigured()) redirect('/notes?connector=google_drive&status=not_configured');

  const state = await createOAuthState('google_drive', user.id);
  redirect(connector.buildAuthUrl(state));
}
