import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { SearchWebTool } from '@/app/tools/search-web.tool';

const authService = new AuthService();
const userSettingsService = new UserSettingsService();
const systemSettingsService = new SystemSettingsService();

export async function GET(request: Request): Promise<Response> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await authService.validateSession(sessionToken);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim();
  if (!query) return Response.json({ error: 'Missing query' }, { status: 400 });

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
}
