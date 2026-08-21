import { apiAuthError, apiData, apiInternalError } from '../_lib/responses';
import { requireApiUser } from '../_lib/auth';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { MODELS } from '@/app/services/llm/models';

const userSettingsService = new UserSettingsService();

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('profile:read', request);
    const settings = await userSettingsService.loadUserSettings(user.id);
    const modelId = settings?.cli_model_id ?? null;
    // Model+provider are required together by the messages endpoint — resolve
    // provider here so the CLI never has to carry its own copy of MODELS.
    const provider = modelId ? MODELS.find(m => m.id === modelId)?.provider ?? null : null;
    return apiData({
      user,
      cliPreferences: {
        domainSlug: settings?.cli_domain_slug ?? null,
        modelId: provider ? modelId : null,
        provider,
      },
    });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/me failed', error);
  }
}
