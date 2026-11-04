import { redirect } from 'next/navigation';
import { requireAuthenticatedUser } from '@/app/lib/domain-access';
import { homePathFor } from '@/app/lib/home-path';
import { AuthService } from '@/app/services/auth/auth.service';

const authService = new AuthService();

/**
 * Home: signed-in users land on the agents screen (the old hub lives at /hub).
 * Non-admins without chat access, e.g. the bot account of a public Unit
 * (openworld, sales), go straight to their first domain, the same target as
 * after login, instead of bouncing through /agents.
 */
export default async function RootPage() {
  const user = await requireAuthenticatedUser();
  if (!user.is_admin && !(await authService.canAccessDomain(user.id, false, 'chat'))) {
    redirect(homePathFor(false, await authService.getFirstDomainSlug(user.id)));
  }
  redirect('/agents');
}
