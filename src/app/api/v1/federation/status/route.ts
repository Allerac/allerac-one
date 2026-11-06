import { flagOn } from '@/federation/capabilities';
import { grantsService } from '@/federation/grants.instance';
import { peerRepository } from '@/federation/peer.repository';
import { statusService } from '@/federation/status.instance';
import { requireApiPrincipal } from '../../_lib/auth';
import { federationErrorResponse } from '../../_lib/federation';
import { apiData, apiError } from '../../_lib/responses';

export const dynamic = 'force-dynamic';

/**
 * Control Tower status for a paired home Unit (federation P4d). Metadata only,
 * last 24h, at most 100 rows per list. Opt-in: ALLERAC_FEDERATION_STATUS=on
 * plus the federation:status:read scope on the peer's key.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const caller = await requireApiPrincipal('federation:status:read', request);
    if (caller.type !== 'service') return apiError('forbidden', 'Forbidden', 403);
    if (!flagOn(process.env, 'ALLERAC_FEDERATION_STATUS')) {
      return apiError('status_disabled', 'Status is not enabled on this Unit', 404);
    }
    const peer = await peerRepository.findActiveByPrincipal(caller.principal.id);
    if (!peer) return apiError('peer_not_active', 'Peer is not active', 403);
    const raw = new URL(request.url).searchParams.get('since');
    const since = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw) : null;
    const status = await statusService.build({
      since, grantedCapabilities: await grantsService.grantedCapabilities(caller.principal.id),
    });
    return apiData(status, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return federationErrorResponse('GET /api/v1/federation/status failed', error);
  }
}
