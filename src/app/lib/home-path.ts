/**
 * Where a signed-in user belongs. Admins get the hub (/). Everyone else gets
 * their first accessible domain, or the login page with a "no access" notice.
 *
 * The no-access target must never redirect again: /login renders it for a
 * signed-in user instead of sending them back to /, which would bounce to
 * /login forever (see src/app/login/page.tsx).
 */
export const NO_ACCESS_PATH = '/login?error=no-access';

export function homePathFor(isAdmin: boolean, firstDomainSlug: string | null): string {
  if (isAdmin) return '/';
  return firstDomainSlug ? `/${firstDomainSlug}` : NO_ACCESS_PATH;
}

/**
 * Target of a non-admin who was refused `deniedSlug`. Sending them back to the
 * very page that refused them would loop, so that case is "no access" too.
 */
export function deniedDomainPathFor(firstDomainSlug: string | null, deniedSlug: string): string {
  if (!firstDomainSlug || firstDomainSlug === deniedSlug) return NO_ACCESS_PATH;
  return `/${firstDomainSlug}`;
}
