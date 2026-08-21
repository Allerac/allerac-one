import { requireApiUser } from '../_lib/auth';
import { apiAuthError, apiData, apiInternalError } from '../_lib/responses';
import { MODELS } from '@/app/services/llm/models';

// Reuses the profile:read scope (already required by /api/v1/me, which the
// CLI calls on every startup) so listing models needs no extra key scope.
export async function GET(request: Request): Promise<Response> {
  try {
    await requireApiUser('profile:read', request);
    return apiData({
      models: MODELS.map(model => ({ id: model.id, name: model.name, provider: model.provider })),
    });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/models failed', error);
  }
}
