import { authenticationErrorResponse, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { getHealthMetrics } from '@/app/actions/health';

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!startDate || !endDate) {
      return Response.json(
        { error: 'startDate and endDate parameters are required' },
        { status: 400 }
      );
    }

    const metrics = await getHealthMetrics(startDate, endDate);
    return Response.json({ metrics });
  } catch (err: unknown) {
    const authError = authenticationErrorResponse(err);
    if (authError) return authError;
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
