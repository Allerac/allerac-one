import { agentsService } from '@/federation/agents.instance';
import { requireApiPrincipal } from '../../_lib/auth';
import { federationErrorResponse } from '../../_lib/federation';
import { apiData, apiError } from '../../_lib/responses';

export const dynamic = 'force-dynamic';

/** A paired Unit lists the agents this Unit exposes to it. */
export async function GET(request: Request): Promise<Response> {
  try {
    const caller = await requireApiPrincipal('federation:agents:list', request);
    if (caller.type !== 'service') return apiError('forbidden', 'Forbidden', 403);
    // `unit` (identity & role, P3.5) rides on the agents list so existing
    // pairings with federation.agents.list get it without a new scope.
    const { agents, unit } = await agentsService.listAgentsWithUnit(caller.principal.id, caller.actingUser.id);
    return apiData({ agents, unit });
  } catch (error: unknown) {
    return federationErrorResponse('GET /api/v1/federation/agents failed', error);
  }
}
