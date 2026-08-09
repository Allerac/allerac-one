import { timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { assertDomainAccess, ForbiddenError, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { StravaApiService } from '@/app/services/strava/strava-api.service';
import { StravaCredentialsService } from '@/app/services/strava/strava-credentials.service';
import { StravaSyncService } from '@/app/services/strava/strava-sync.service';

const api = new StravaApiService();
const credentials = new StravaCredentialsService(api);

function equal(a: string, b: string) {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export async function GET(request: Request) {
  let user;
  try {
    user = await requireCurrentUser();
    await assertDomainAccess(user, 'health');
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    if (error instanceof ForbiddenError) redirect('/?error=health_access_denied');
    throw error;
  }
  const params = new URL(request.url).searchParams;
  const code = params.get('code') ?? '';
  const receivedState = params.get('state') ?? '';
  const scope = params.get('scope') ?? 'read,activity:read_all';
  const store = await cookies();
  const stored = store.get('strava_oauth_state')?.value ?? '';
  store.delete('strava_oauth_state');
  const separator = stored.indexOf(':');
  const storedUser = separator >= 0 ? stored.slice(0, separator) : '';
  const storedState = separator >= 0 ? stored.slice(separator + 1) : '';
  if (!code || code.length > 2000 || storedUser !== user.id || !equal(storedState, receivedState)) {
    redirect('/health?strava=error');
  }
  try {
    const tokens = await api.exchangeCode(code);
    await credentials.save(user.id, tokens, tokens.athlete, scope);
    new StravaSyncService(api, credentials).syncRecent(user.id, { perPage: 30 }).catch((error) => {
      console.error('[Strava] Initial sync failed:', error instanceof Error ? error.message : error);
    });
  } catch (error) {
    console.error('[Strava] OAuth callback failed:', error instanceof Error ? error.message : error);
    redirect('/health?strava=error');
  }
  redirect('/health?strava=connected');
}
