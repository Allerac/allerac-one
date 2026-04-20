import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { getActivitiesRange } from '@/app/actions/health';

const authService = new AuthService();

export async function GET(request: Request): Promise<Response> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;

  if (!sessionToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await authService.validateSession(sessionToken);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!startDate || !endDate) {
      return Response.json({ error: 'Missing startDate or endDate parameter' }, { status: 400 });
    }

    const result = await getActivitiesRange(user.id, startDate, endDate);
    return Response.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
