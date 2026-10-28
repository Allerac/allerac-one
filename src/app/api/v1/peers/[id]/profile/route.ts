import { federationClient } from '@/federation/federation-client.instance';
import { requireSessionAdmin } from '../../../_lib/auth';
import { federationErrorResponse } from '../../../_lib/federation';
import { apiData, apiError } from '../../../_lib/responses';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** Live identity & role of a paired Unit plus its agents (P3.5). Admin only. */
export async function GET(_request: Request, context: Context): Promise<Response> {
  try {
    const admin = await requireSessionAdmin();
    const { id } = await context.params;
    const peer = await federationClient.findActivePeer(id);
    if (!peer) return apiError('not_found', 'Unit not found or not paired', 404);
    if (!peer.outboundCapabilities.includes('federation.agents.list')) {
      return apiData({ unit: null, agents: [], note: 'This Unit did not grant agent listing.' });
    }
    const result = await federationClient.listAgentsWithUnit(peer.id, { initiatedByUserId: admin.id });
    return apiData(result);
  } catch (error: unknown) {
    return federationErrorResponse('GET /api/v1/peers/:id/profile failed', error);
  }
}
