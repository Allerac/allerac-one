import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  assertDomainAccess,
  ForbiddenError,
  requireCurrentUser,
  UnauthorizedError,
} from '@/app/lib/auth-session';
import { SpotifyApiService } from '@/app/services/spotify/spotify-api.service';

const api = new SpotifyApiService();

export async function GET() {
  let user;
  try {
    user = await requireCurrentUser();
    await assertDomainAccess(user, 'music');
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    if (error instanceof ForbiddenError) redirect('/?error=music_access_denied');
    throw error;
  }

  if (!api.isConfigured()) redirect('/music?spotify=not_configured');

  const state = randomBytes(32).toString('base64url');
  const cookieStore = await cookies();
  cookieStore.set('spotify_oauth_state', `${user.id}:${state}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  redirect(api.buildAuthUrl(state));
}
