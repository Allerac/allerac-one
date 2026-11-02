import { agentToolSettingsInputSchema, describeAgentToolSettings } from '@/app/services/agent/agent-tool-settings';
import { loadAgentToolSettings, saveAgentToolSettings } from '@/app/services/agent/agent-tool-settings.repository';
import { requireSessionAdmin } from '../../_lib/auth';
import { federationErrorResponse, readJson } from '../../_lib/federation';
import { apiData, apiError } from '../../_lib/responses';

export const dynamic = 'force-dynamic';

/**
 * Tool settings of this Unit's `chat` agent (phase 3a): module, tool and
 * skill toggles, capped by ALLERAC_MODULES. Admin only, local only: never
 * exposed to paired Units.
 */
export async function GET(): Promise<Response> {
  try {
    await requireSessionAdmin();
    return apiData(describeAgentToolSettings(await loadAgentToolSettings()));
  } catch (error: unknown) {
    return federationErrorResponse('GET /api/v1/unit/agent-tools failed', error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const admin = await requireSessionAdmin();
    const parsed = agentToolSettingsInputSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError('validation_error', 'Invalid agent tool settings', 400, parsed.error.flatten());
    return apiData(describeAgentToolSettings(await saveAgentToolSettings(parsed.data, admin.id)));
  } catch (error: unknown) {
    return federationErrorResponse('PUT /api/v1/unit/agent-tools failed', error);
  }
}
