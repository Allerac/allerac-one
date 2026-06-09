import { authenticationErrorResponse, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { getHealthSummary } from '@/app/actions/health';

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const period = (url.searchParams.get('period') || 'week') as 'day' | '3days' | 'week' | 'month' | 'year';
    const summary = await getHealthSummary(period);
    return Response.json(summary);
  } catch (err: unknown) {
    const authError = authenticationErrorResponse(err);
    if (authError) return authError;
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
