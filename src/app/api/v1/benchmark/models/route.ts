import { requireApiUser } from '@/app/api/v1/_lib/auth';
import { apiAuthError, apiData, apiInternalError } from '@/app/api/v1/_lib/responses';
import { getBenchmarkModelAvailability } from '@/app/services/benchmark/benchmark-query.service';
import { MODELS } from '@/app/services/llm/models';

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('benchmark:read', request);
    const availability = await getBenchmarkModelAvailability(user.id);
    const models = MODELS.map(model => ({
      id: model.id,
      name: model.name,
      provider: model.provider,
      available: model.provider === 'ollama'
        ? availability.ollamaModels.includes(model.id)
        : availability.providers[model.provider],
    }));
    return apiData({ models, providers: availability.providers });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/benchmark/models failed', error);
  }
}
