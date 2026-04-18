import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { getGarminStatus } from '@/app/actions/health';

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
    const status = await getGarminStatus(user.id);
    return Response.json(status);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
