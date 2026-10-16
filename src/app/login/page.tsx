import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthService } from '@/app/services/auth/auth.service';
import { homePathFor, NO_ACCESS_PATH } from '@/app/lib/home-path';
import LoginClient from './LoginClient';

const authService = new AuthService();

export default async function LoginPage(
  { searchParams }: { searchParams?: Promise<{ error?: string | string[] }> } = {},
) {
  // Every "no access" redirect ends here; never send it anywhere else, or a
  // user whose domain refuses them would bounce between the two pages.
  const error = (await searchParams)?.error;
  if (error === 'no-access') return <LoginClient />;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (sessionToken) {
    const user = await authService.validateSession(sessionToken);
    if (user) {
      const home = homePathFor(
        user.is_admin,
        user.is_admin ? null : await authService.getFirstDomainSlug(user.id),
      );
      // A signed-in user with nowhere to go stays here and sees the "no access"
      // notice (and can sign in with another account). Redirecting to / would
      // send them straight back to /login: an endless loop.
      if (home !== NO_ACCESS_PATH) redirect(home);
    }
  }

  return <LoginClient />;
}
