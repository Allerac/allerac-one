import { z } from 'zod';
import { updateUnitAgentSchema } from '@/app/services/agent/unit-agents';
import {
  archiveUnitAgent,
  getUnitAgent,
  unarchiveUnitAgent,
  updateUnitAgent,
} from '@/app/services/agent/unit-agents.repository';
import { botsEnabled } from '@/app/services/agent/bot-runtime';
import { requireSessionAdmin } from '../../../_lib/auth';
import { federationErrorResponse, readJson } from '../../../_lib/federation';
import { apiData, apiError } from '../../../_lib/responses';
import { unitAgentErrorResponse } from '../_errors';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ slug: string }> };

/** `archived` archives (true) or restores (false) the bot; the other fields edit it. */
const patchSchema = updateUnitAgentSchema.extend({ archived: z.boolean().optional() }).strict();

/** One bot, archived included. Admin only. */
export async function GET(_request: Request, context: Context): Promise<Response> {
  try {
    await requireSessionAdmin();
    const { slug } = await context.params;
    const agent = await getUnitAgent(slug);
    return agent ? apiData(agent) : apiError('not_found', `Bot not found: ${slug}`, 404);
  } catch (error: unknown) {
    return federationErrorResponse('GET /api/v1/unit/agents/[slug] failed', error);
  }
}

/** Edits, archives or restores a bot (multi-bot PR 2). Admin only; needs ALLERAC_BOTS=true. */
export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const admin = await requireSessionAdmin();
    if (!botsEnabled()) return apiError('bots_disabled', 'Bots are not enabled in this Unit', 404);
    const { slug } = await context.params;
    const parsed = patchSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError('validation_error', 'Invalid bot update', 400, parsed.error.flatten());

    const { archived, ...fields } = parsed.data;
    let agent = Object.keys(fields).length ? await updateUnitAgent(slug, fields, admin.id) : null;
    if (archived === true) agent = await archiveUnitAgent(slug, admin.id);
    if (archived === false) agent = await unarchiveUnitAgent(slug, admin.id);
    agent ??= await getUnitAgent(slug);
    return agent ? apiData(agent) : apiError('not_found', `Bot not found: ${slug}`, 404);
  } catch (error: unknown) {
    return unitAgentErrorResponse(error) ?? federationErrorResponse('PATCH /api/v1/unit/agents/[slug] failed', error);
  }
}
