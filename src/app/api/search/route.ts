import {
  authenticationErrorResponse,
  assertDomainAccess,
  ForbiddenError,
  requireCurrentUser,
  UnauthorizedError,
} from '@/app/lib/auth-session';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { SearchWebTool } from '@/app/tools/search-web.tool';

const userSettingsService = new UserSettingsService();
const systemSettingsService = new SystemSettingsService();

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireCurrentUser();
    await assertDomainAccess(user, 'search');

    const url = new URL(request.url);
    const query = url.searchParams.get('q')?.trim();
    if (!query) return Response.json({ error: 'Missing query' }, { status: 400 });
    if (query.length > 500) {
      return Response.json({ error: 'Query too long' }, { status: 400 });
    }

    const [settings, sysSettings] = await Promise.all([
      userSettingsService.loadUserSettings(user.id),
      systemSettingsService.loadAll(),
    ]);
    const tavilyApiKey = settings?.tavily_api_key || sysSettings.tavily_api_key || process.env.TAVILY_API_KEY;
    const githubToken = settings?.github_token || sysSettings.github_token || process.env.GITHUB_TOKEN || '';

    if (!tavilyApiKey) {
      return Response.json({ error: 'Tavily API key not configured. Please add your Tavily API key in settings.' }, { status: 422 });
    }

    const tool = new SearchWebTool(tavilyApiKey, githubToken);
    const result = await tool.execute(query);
    return Response.json(result);
  } catch (error) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    console.error('[Search API] Request failed:', error);
    return Response.json({ error: 'Search failed' }, { status: 500 });
  }
}
