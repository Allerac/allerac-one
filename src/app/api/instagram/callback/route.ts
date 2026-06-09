/**
 * /api/instagram/callback — Instagram OAuth callback
 *
 * Receives the authorization code from Instagram, exchanges it for tokens,
 * fetches the user's profile, and stores credentials encrypted in the DB.
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
import { InstagramCredentialsService } from '@/app/services/instagram/instagram-credentials.service';

const instagramService = new InstagramGraphService();
const credService      = new InstagramCredentialsService();

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

  const { searchParams } = new URL(request.url);
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const cookieStore = await cookies();

  // User denied or error from Instagram
  if (error || !code || code.length > 2_000) {
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

    // Fetch profile — /me returns the Business Login scoped ID (used for publishing)
    const profile = await instagramService.getMe(accessToken);

    // igUserId = legacyUserId (webhook-compatible)
    // profile.id = Business Login ID (Graph API publishing)
    const webhookUserId = igUserId;  // For DM webhooks
    const businessUserId = profile.id;  // For publishing

    // Store both IDs
    await credService.saveTokens(user.id, {
      accessToken,
      igUserId:  webhookUserId,
      igBusinessUserId: businessUserId,
      username:  profile.username ?? '',
      expiresAt,
      scopes:    'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish',
    });

    // Subscribe this IG account to webhook message + comment events
    // Must use the Business Login scoped ID (businessUserId), not the legacy webhookUserId
    try {
      const subRes = await fetch(
        `https://graph.instagram.com/v21.0/${businessUserId}/subscribed_apps`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ subscribed_fields: 'messages,comments' }),
        }
      );
      const subData = await subRes.json();
      console.log(`[Instagram] Webhook subscription:`, JSON.stringify(subData));
    } catch (subErr) {
      console.warn('[Instagram] Could not subscribe to webhook:', subErr);
    }

    console.log(`[Instagram] Connected account @${profile.username} for user ${user.id}`);
    redirect('/social?instagram=connected');

  } catch (err: any) {
    // Next.js redirect() throws internally — let it propagate
    if (err?.message === 'NEXT_REDIRECT' || err?.digest?.startsWith('NEXT_REDIRECT')) throw err;
    console.error('[Instagram] OAuth callback error:', err.message);
    await credService.setError(user.id, err.message);
    redirect('/social?instagram=error');
  }
}
