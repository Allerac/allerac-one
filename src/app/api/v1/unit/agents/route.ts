import { listUnitAgents } from '@/app/services/agent/unit-agents.repository';
import { requireSessionAdmin } from '../../_lib/auth';
import { federationErrorResponse } from '../../_lib/federation';
import { apiData } from '../../_lib/responses';

export const dynamic = 'force-dynamic';

/**
 * Bots of this Unit (multi-bot PR 1, read-only). The default bot comes first;
 * `?archived=true` also lists archived bots. Admin only, local only: never
 * exposed to paired Units.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireSessionAdmin();
    const includeArchived = new URL(request.url).searchParams.get('archived') === 'true';
    return apiData(await listUnitAgents({ includeArchived }));
  } catch (error: unknown) {
    return federationErrorResponse('GET /api/v1/unit/agents failed', error);
  }
}
