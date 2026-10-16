import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { isDomainEnabled } from '@/modules/registry';
import { AuthService, User } from '@/app/services/auth/auth.service';
import { deniedDomainPathFor, homePathFor } from '@/app/lib/home-path';

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

  // Module turned off in this Unit (ALLERAC_MODULES / ALLERAC_PROFILE): the page does not exist.
  if (!isDomainEnabled(slug)) notFound();

  const allowed = await authService.canAccessDomain(user.id, user.is_admin, slug);
  if (!allowed) {
    const firstSlug = await authService.getFirstDomainSlug(user.id);
    redirect(deniedDomainPathFor(firstSlug, slug));
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
    redirect(homePathFor(false, slug));
  }

  return user;
}
