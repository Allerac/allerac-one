import { authenticationErrorResponse, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { getActivitiesRange } from '@/app/actions/health';

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!startDate || !endDate) {
      return Response.json({ error: 'Missing startDate or endDate parameter' }, { status: 400 });
    }

    const result = await getActivitiesRange(startDate, endDate);
    return Response.json(result);
  } catch (err: unknown) {
    const authError = authenticationErrorResponse(err);
    if (authError) return authError;
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
