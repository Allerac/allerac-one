import { authenticationErrorResponse, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { getRecentActivities } from '@/app/actions/health';

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);
    const date = url.searchParams.get('date') || undefined;
    const activities = await getRecentActivities(limit, date || undefined);
    return Response.json({ activities });
  } catch (err: unknown) {
    const authError = authenticationErrorResponse(err);
    if (authError) return authError;
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
