import { z } from 'zod';
import {
  ServicePrincipalNameTakenError,
  servicePrincipalService,
} from '@/app/services/service-principals/service-principal.service';
import { requireSessionAdmin } from '../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../_lib/responses';
import { servicePrincipalDto } from './_lib';

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  peerUrl: z.string().url().optional().nullable(),
  // Local user the peer acts as. Defaults to the calling admin.
  actingUserId: z.string().uuid().optional(),
});

export async function GET(): Promise<Response> {
  try {
    await requireSessionAdmin();
    const principals = await servicePrincipalService.list();
    return apiData({ servicePrincipals: principals.map(servicePrincipalDto) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/service-principals failed', error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const admin = await requireSessionAdmin();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid service principal payload', 400, parsed.error.flatten());
    }
    const principal = await servicePrincipalService.create({
      name: parsed.data.name,
      peerUrl: parsed.data.peerUrl ?? null,
      actingUserId: parsed.data.actingUserId ?? admin.id,
      createdBy: admin.id,
    });
    return apiData({ servicePrincipal: servicePrincipalDto(principal) }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ServicePrincipalNameTakenError) {
      return apiError('conflict', error.message, 409);
    }
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/service-principals failed', error);
  }
}
