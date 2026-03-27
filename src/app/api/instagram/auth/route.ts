/**
 * /api/instagram/auth — Initiates Instagram OAuth flow
 *
 * Sets a short-lived state cookie and redirects to Instagram's auth page.
 * The callback at /api/instagram/callback handles the code exchange.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthService } from '@/app/services/auth/auth.service';
import { InstagramGraphService } from '@/app/services/instagram/instagram-graph.service';

const authService      = new AuthService();
const instagramService = new InstagramGraphService();

export async function GET() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) redirect('/login');

  const user = await authService.validateSession(sessionToken);
  if (!user) redirect('/login');

  if (!instagramService.isConfigured()) {
    redirect('/social?error=instagram_not_configured');
  }

  // Generate and store state to prevent CSRF
  const state = crypto.randomUUID();
  cookieStore.set('instagram_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  const authUrl = instagramService.buildAuthUrl(state);
  redirect(authUrl);
}
