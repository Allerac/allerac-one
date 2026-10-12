import { z } from 'zod';
import { apiKeyService } from '@/app/services/api-keys/api-key.service';
import { unknownScopes } from '@/app/services/api-keys/api-key-scopes';
import { requireSessionApiUser } from '../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../_lib/responses';
import { apiKeyDto, DEFAULT_DOMAIN_USERS_SCOPES } from './_lib';

const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
  // Required and non-empty: a key with no scopes would grant nothing.
  scopes: z.array(z.string().trim().min(1)).min(1),
  expiresAt: z.string().datetime().optional().nullable(),
});

export async function GET(_request: Request): Promise<Response> {
  try {
    const user = await requireSessionApiUser('api_keys:read');
    const apiKeys = await apiKeyService.list(user.id);
    return apiData({ apiKeys: apiKeys.map(apiKeyDto) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/api-keys failed', error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireSessionApiUser('api_keys:write');
    const parsed = createApiKeySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid API key payload', 400, parsed.error.flatten());
    }

    const unknown = unknownScopes(parsed.data.scopes);
    if (unknown.length > 0) {
      return apiError('validation_error', `Unknown scope(s): ${unknown.join(', ')}`, 400);
    }

    if (!user.isAdmin) {
      const disallowed = parsed.data.scopes.filter(scope => !DEFAULT_DOMAIN_USERS_SCOPES.includes(scope));
      if (disallowed.length > 0) {
        return apiError('forbidden_scope', `Scope(s) not available for self-service: ${disallowed.join(', ')}`, 403);
      }
    }

    const created = await apiKeyService.create({
      userId: user.id,
      name: parsed.data.name,
      scopes: parsed.data.scopes,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    });

    return apiData({
      apiKey: apiKeyDto(created.apiKey),
      secret: created.secret,
    }, { status: 201 });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/api-keys failed', error);
  }
}
