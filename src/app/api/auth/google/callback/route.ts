import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthService } from '@/app/services/auth/auth.service';

const authService = new AuthService();
const SESSION_COOKIE_NAME = 'session_token';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) redirect('/login?error=google_denied');

  const cookieStore = await cookies();
  const storedState = cookieStore.get('google_oauth_state')?.value;
  cookieStore.delete('google_oauth_state');

  if (!code || !state || state !== storedState) {
    redirect('/login?error=google_invalid_state');
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const appUrl       = process.env.APP_URL ?? 'http://localhost:8080';
  const redirectUri  = `${appUrl}/api/auth/google/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });

  if (!tokenRes.ok) redirect('/login?error=google_token_failed');

  const { access_token } = await tokenRes.json();

  // Fetch user profile
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!profileRes.ok) redirect('/login?error=google_profile_failed');

  const profile: { id: string; email: string; name?: string } = await profileRes.json();

  if (!profile.id || !profile.email) redirect('/login?error=google_no_email');

  // Find or create user
  const result = await authService.loginWithGoogle(profile.id, profile.email, profile.name ?? null);
  if (!result.success) redirect('/login?error=google_login_failed');

  cookieStore.set(SESSION_COOKIE_NAME, result.session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: result.session.expiresAt,
    path: '/',
  });

  // Redirect based on role
  const { AuthService: AS } = await import('@/app/services/auth/auth.service');
  const as = new AS();
  if (result.user.is_admin) redirect('/');
  const slug = await as.getFirstDomainSlug(result.user.id);
  redirect(slug ? `/${slug}` : '/login?error=no-access');
}
