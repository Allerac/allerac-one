import { z } from 'zod';
import { ApiKeyInvalidScopesError } from '@/app/services/api-keys/api-key.service';
import { isServiceAllowedScope, unknownScopes } from '@/app/services/api-keys/api-key-scopes';
import { servicePrincipalService } from '@/app/services/service-principals/service-principal.service';
import { requireSessionAdmin } from '../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../_lib/responses';
import { apiKeyDto } from '../../../api-keys/_lib';

const createKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.string().trim().min(1)).min(1),
  expiresAt: z.string().datetime().optional().nullable(),
});

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    await requireSessionAdmin();
    const { id } = await context.params;
    const parsed = createKeySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid service key payload', 400, parsed.error.flatten());
    }

    const unknown = unknownScopes(parsed.data.scopes);
    if (unknown.length > 0) {
      return apiError('validation_error', `Unknown scope(s): ${unknown.join(', ')}`, 400);
    }
    const disallowed = parsed.data.scopes.filter(scope => !isServiceAllowedScope(scope));
    if (disallowed.length > 0) {
      return apiError('forbidden_scope', `Scope(s) not allowed for service keys: ${disallowed.join(', ')}`, 403);
    }

    const principal = await servicePrincipalService.get(id);
    if (!principal) return apiError('not_found', 'Service principal not found', 404);
    if (principal.disabledAt) return apiError('conflict', 'Service principal is disabled', 409);

    const created = await servicePrincipalService.createKey({
      principal,
      name: parsed.data.name,
      scopes: parsed.data.scopes,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    });
    return apiData({ apiKey: apiKeyDto(created.apiKey), secret: created.secret }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ApiKeyInvalidScopesError) {
      return apiError('validation_error', error.message, 400);
    }
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/service-principals/:id/keys failed', error);
  }
}
