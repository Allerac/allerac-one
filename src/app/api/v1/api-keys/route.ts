import { z } from 'zod';
import { apiKeyService } from '@/app/services/api-keys/api-key.service';
import { requireSessionApiUser } from '../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../_lib/responses';
import { apiKeyDto } from './_lib';

const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.string().trim().min(1)).optional(),
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
