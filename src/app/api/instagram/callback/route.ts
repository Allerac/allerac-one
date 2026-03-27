/**
 * /api/instagram/callback — Instagram OAuth callback
 *
 * Receives the authorization code from Instagram, exchanges it for tokens,
 * fetches the user's profile, and stores credentials encrypted in the DB.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthService } from '@/app/services/auth/auth.service';
import { InstagramGraphService } from '@/app/services/instagram/instagram-graph.service';
import { InstagramCredentialsService } from '@/app/services/instagram/instagram-credentials.service';

const authService      = new AuthService();
const instagramService = new InstagramGraphService();
const credService      = new InstagramCredentialsService();

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) redirect('/login');

  const user = await authService.validateSession(sessionToken);
  if (!user) redirect('/login');

  const { searchParams } = new URL(request.url);
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // User denied or error from Instagram
  if (error || !code) {
    await credService.setError(user.id, error ?? 'Authorization denied');
    redirect('/social?instagram=error');
  }

  // Validate CSRF state
  const storedState = cookieStore.get('instagram_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    await credService.setError(user.id, 'Invalid OAuth state — possible CSRF');
    redirect('/social?instagram=error');
  }

  // Clear state cookie
  cookieStore.delete('instagram_oauth_state');

  try {
    // Exchange code for tokens
    const { accessToken, igUserId, expiresAt } = await instagramService.exchangeCodeForToken(code);

    // Fetch profile
    const profile = await instagramService.getMe(accessToken);

    // Store encrypted
    await credService.saveTokens(user.id, {
      accessToken,
      igUserId:  profile.id ?? igUserId,
      username:  profile.username ?? '',
      expiresAt,
      scopes:    'instagram_basic,instagram_manage_messages,instagram_content_publish',
    });

    console.log(`[Instagram] Connected account @${profile.username} for user ${user.id}`);
    redirect('/social?instagram=connected');

  } catch (err: any) {
    console.error('[Instagram] OAuth callback error:', err.message);
    await credService.setError(user.id, err.message);
    redirect('/social?instagram=error');
  }
}
