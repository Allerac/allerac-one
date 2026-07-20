import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthService, User } from '@/app/services/auth/auth.service';

const authService = new AuthService();

/** Validates a session for authenticated pages that are not tied to a domain. */
export async function requireAuthenticatedUser(): Promise<User> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) redirect('/login');

  const user = await authService.validateSession(token);
  if (!user) redirect('/login');

  return user;
}

/**
 * Validates session and checks domain access.
 * Redirects to /login if not authenticated.
 * Redirects to the user's first domain (or /) if access is denied.
 * Returns the authenticated user when access is granted.
 */
export async function requireDomainAccess(slug: string): Promise<User> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) redirect('/login');

  const user = await authService.validateSession(token);
  if (!user) redirect('/login');

  const allowed = await authService.canAccessDomain(user.id, user.is_admin, slug);
  if (!allowed) {
    const firstSlug = await authService.getFirstDomainSlug(user.id);
    redirect(firstSlug ? `/${firstSlug}` : '/login?error=no-access');
  }

  return user;
}

/**
 * Validates session and checks admin access (for the desktop / hub).
 * Redirects non-admin users to their first assigned domain.
 * Returns the authenticated admin user.
 */
export async function requireAdmin(): Promise<User> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) redirect('/login');

  const user = await authService.validateSession(token);
  if (!user) redirect('/login');

  if (!user.is_admin) {
    const slug = await authService.getFirstDomainSlug(user.id);
    redirect(slug ? `/${slug}` : '/login?error=no-access');
  }

  return user;
}
