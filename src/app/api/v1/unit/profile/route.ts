import { exposedAgentSlugs } from '@/federation/env';
import { resolveUnitProfile, unitProfileInputSchema } from '@/federation/unit-profile';
import { loadUnitProfileRow, saveUnitProfile } from '@/federation/unit-profile.repository';
import { requireSessionAdmin } from '../../_lib/auth';
import { federationErrorResponse, readJson } from '../../_lib/federation';
import { apiData, apiError } from '../../_lib/responses';

export const dynamic = 'force-dynamic';

/** This Unit's identity & role (P3.5): stored row, effective values, exposed agents. Admin only. */
export async function GET(): Promise<Response> {
  try {
    await requireSessionAdmin();
    const stored = await loadUnitProfileRow();
    return apiData({ stored, effective: resolveUnitProfile(stored), exposedAgents: exposedAgentSlugs() });
  } catch (error: unknown) {
    return federationErrorResponse('GET /api/v1/unit/profile failed', error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const admin = await requireSessionAdmin();
    const parsed = unitProfileInputSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError('validation_error', 'Invalid unit profile', 400, parsed.error.flatten());
    const stored = await saveUnitProfile(parsed.data, admin.id);
    return apiData({ stored, effective: resolveUnitProfile(stored), exposedAgents: exposedAgentSlugs() });
  } catch (error: unknown) {
    return federationErrorResponse('PUT /api/v1/unit/profile failed', error);
  }
}
