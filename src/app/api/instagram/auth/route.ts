/**
 * /api/instagram/auth — Initiates Instagram OAuth flow
 *
 * Sets a short-lived state cookie and redirects to Instagram's auth page.
 * The callback at /api/instagram/callback handles the code exchange.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  assertDomainAccess,
  ForbiddenError,
  requireCurrentUser,
  UnauthorizedError,
} from '@/app/lib/auth-session';
import { InstagramGraphService } from '@/app/services/instagram/instagram-graph.service';

const instagramService = new InstagramGraphService();

export async function GET() {
  try {
    const user = await requireCurrentUser();
    await assertDomainAccess(user, 'social');
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    if (error instanceof ForbiddenError) redirect('/?error=social_access_denied');
    throw error;
  }

  if (!instagramService.isConfigured()) {
    redirect('/social?error=instagram_not_configured');
  }

  // Generate and store state to prevent CSRF
  const state = crypto.randomUUID();
  const cookieStore = await cookies();
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
