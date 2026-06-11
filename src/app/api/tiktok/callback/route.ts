import { timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  assertDomainAccess,
  ForbiddenError,
  requireCurrentUser,
  UnauthorizedError,
} from '@/app/lib/auth-session';
import { TikTokApiService } from '@/app/services/tiktok/tiktok-api.service';
import { TikTokCredentialsService } from '@/app/services/tiktok/tiktok-credentials.service';

const api = new TikTokApiService();
const credentials = new TikTokCredentialsService(api);

function equalState(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function GET(request: Request) {
  let user;
  try {
    user = await requireCurrentUser();
    await assertDomainAccess(user, 'social');
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    if (error instanceof ForbiddenError) redirect('/?error=social_access_denied');
    throw error;
  }

  const searchParams = new URL(request.url).searchParams;
  const code = searchParams.get('code') ?? '';
  const state = searchParams.get('state') ?? '';
  const providerError = searchParams.get('error');
  const cookieStore = await cookies();
  const stored = cookieStore.get('tiktok_oauth_state')?.value ?? '';
  cookieStore.delete('tiktok_oauth_state');

  const separator = stored.indexOf(':');
  const storedUserId = separator >= 0 ? stored.slice(0, separator) : '';
  const storedState = separator >= 0 ? stored.slice(separator + 1) : '';

  if (
    providerError ||
    !code ||
    code.length > 2_000 ||
    !state ||
    storedUserId !== user.id ||
    !equalState(storedState, state)
  ) {
    await credentials.setError(
      user.id,
      providerError ? 'tiktok_authorization_denied' : 'tiktok_oauth_invalid',
    );
    redirect('/social?tiktok=error');
  }

  try {
    const tokens = await api.exchangeCodeForToken(code);
    const profile = await api.getProfile(tokens.access_token);
    await credentials.saveTokens(user.id, tokens, profile);
  } catch {
    console.error('[TikTok] OAuth callback failed');
    await credentials.setError(user.id, 'tiktok_connection_failed');
    redirect('/social?tiktok=error');
  }
  redirect('/social?tiktok=connected');
}
