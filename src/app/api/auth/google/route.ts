import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) redirect('/login?error=google_not_configured');

  const appUrl = process.env.APP_URL ?? 'http://localhost:8080';
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set('google_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  const params = new URLSearchParams({
    client_id: clientId!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });

  redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
