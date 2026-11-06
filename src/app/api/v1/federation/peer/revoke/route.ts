import { pairingService } from '@/federation/pairing.instance';
import { requireApiPrincipal } from '../../../_lib/auth';
import { federationErrorResponse } from '../../../_lib/federation';
import { apiData, apiError } from '../../../_lib/responses';

/** A paired Unit ends the pairing using its own service key. */
export async function POST(request: Request): Promise<Response> {
  try {
    const caller = await requireApiPrincipal('federation:peer:revoke', request);
    if (caller.type !== 'service') return apiError('forbidden', 'Forbidden', 403);
    await pairingService.revokeByPeer(caller.principal.id);
    return apiData({ revoked: true });
  } catch (error: unknown) {
    return federationErrorResponse('POST /api/v1/federation/peer/revoke failed', error);
  }
}
