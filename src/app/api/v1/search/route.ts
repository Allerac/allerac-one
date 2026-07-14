import { z } from 'zod';
import { requireApiDomainUser } from '../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../_lib/responses';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SearchWebTool } from '@/app/tools/search-web.tool';

const querySchema = z.object({
  q: z.string().trim().min(1).max(500),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiDomainUser('search:read', 'search', request);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid search query', 400, parsed.error.flatten());
    }

    const userSettingsService = new UserSettingsService();
    const systemSettingsService = new SystemSettingsService();
    const [settings, sysSettings] = await Promise.all([
      userSettingsService.loadUserSettings(user.id),
      systemSettingsService.loadAll(),
    ]);
    const tavilyApiKey = settings?.tavily_api_key || sysSettings.tavily_api_key || process.env.TAVILY_API_KEY;
    const githubToken = settings?.github_token || sysSettings.github_token || process.env.GITHUB_TOKEN || '';

    if (!tavilyApiKey) {
      return apiError('provider_not_configured', 'Tavily API key is not configured.', 422);
    }

    const result = await new SearchWebTool(tavilyApiKey, githubToken).execute(parsed.data.q);
    return apiData({ search: result });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/search failed', error);
  }
}
