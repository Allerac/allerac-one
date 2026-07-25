import { timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  assertDomainAccess,
  ForbiddenError,
  requireCurrentUser,
  UnauthorizedError,
} from '@/app/lib/auth-session';
import { SpotifyApiService } from '@/app/services/spotify/spotify-api.service';
import { SpotifyCredentialsService } from '@/app/services/spotify/spotify-credentials.service';
import { runSpotifySync } from '@/app/services/spotify/spotify-sync.service';

const api = new SpotifyApiService();
const credentials = new SpotifyCredentialsService(api);

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
    await assertDomainAccess(user, 'music');
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    if (error instanceof ForbiddenError) redirect('/?error=music_access_denied');
    throw error;
  }

  const searchParams = new URL(request.url).searchParams;
  const code = searchParams.get('code') ?? '';
  const state = searchParams.get('state') ?? '';
  const providerError = searchParams.get('error');
  const cookieStore = await cookies();
  const stored = cookieStore.get('spotify_oauth_state')?.value ?? '';
  cookieStore.delete('spotify_oauth_state');

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
      providerError ? 'spotify_authorization_denied' : 'spotify_oauth_invalid',
    );
    redirect('/music?spotify=error');
  }

  try {
    const tokens = await api.exchangeCodeForToken(code);
    const profile = await api.getProfile(tokens.access_token);
    await credentials.saveTokens(user.id, tokens, profile);
  } catch {
    console.error('[Spotify] OAuth callback failed');
    await credentials.setError(user.id, 'spotify_connection_failed');
    redirect('/music?spotify=error');
  }

  // Best-effort initial sync — failures here shouldn't block the connect flow.
  runSpotifySync(user.id).catch((error) => {
    console.error('[Spotify] Initial sync failed:', error instanceof Error ? error.message : error);
  });

  redirect('/music?spotify=connected');
}
