import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { assertDomainAccess, ForbiddenError, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { StravaApiService } from '@/app/services/strava/strava-api.service';

const api = new StravaApiService();

export async function GET() {
  let user;
  try {
    user = await requireCurrentUser();
    await assertDomainAccess(user, 'health');
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    if (error instanceof ForbiddenError) redirect('/?error=health_access_denied');
    throw error;
  }
  if (!api.isConfigured()) redirect('/health?strava=not_configured');
  const state = randomBytes(32).toString('base64url');
  (await cookies()).set('strava_oauth_state', `${user.id}:${state}`, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600, path: '/',
  });
  redirect(api.buildAuthUrl(state));
}
