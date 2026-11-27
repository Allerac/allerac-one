import { createUnitAgentSchema } from '@/app/services/agent/unit-agents';
import { createUnitAgent, listUnitAgents } from '@/app/services/agent/unit-agents.repository';
import { botsEnabled } from '@/app/services/agent/bot-runtime';
import { requireSessionAdmin } from '../../_lib/auth';
import { federationErrorResponse, readJson } from '../../_lib/federation';
import { apiData, apiError } from '../../_lib/responses';
import { unitAgentErrorResponse } from './_errors';

export const dynamic = 'force-dynamic';

/**
 * Bots of this Unit (multi-bot PR 1). The default bot comes first;
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

/** Creates a bot (multi-bot PR 2). Admin only; needs ALLERAC_BOTS=true. */
export async function POST(request: Request): Promise<Response> {
  try {
    const admin = await requireSessionAdmin();
    if (!botsEnabled()) return apiError('bots_disabled', 'Bots are not enabled in this Unit', 404);
    const parsed = createUnitAgentSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError('validation_error', 'Invalid bot', 400, parsed.error.flatten());
    return apiData(await createUnitAgent(parsed.data, admin.id), { status: 201 });
  } catch (error: unknown) {
    return unitAgentErrorResponse(error) ?? federationErrorResponse('POST /api/v1/unit/agents failed', error);
  }
}
