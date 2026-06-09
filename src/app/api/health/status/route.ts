import { authenticationErrorResponse, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { getGarminStatus } from '@/app/actions/health';

export async function GET(): Promise<Response> {
  try {
    const user = await requireCurrentUser();
    const status = await getGarminStatus();
    return Response.json(status);
  } catch (err: unknown) {
    const authError = authenticationErrorResponse(err);
    if (authError) return authError;
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
