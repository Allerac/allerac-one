import { authenticationErrorResponse, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { getDailyHealth } from '@/app/actions/health';

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const date = url.searchParams.get('date');

    if (!date) {
      return Response.json({ error: 'Missing date parameter (YYYY-MM-DD)' }, { status: 400 });
    }

    const metrics = await getDailyHealth(date);
    return Response.json(metrics);
  } catch (err: unknown) {
    const authError = authenticationErrorResponse(err);
    if (authError) return authError;
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
