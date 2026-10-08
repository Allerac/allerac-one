/**
 * Public self-registration policy.
 *
 * Closed by default. With ALLOW_REGISTRATION unset or anything other than
 * "true", new accounts can only be created by:
 * - the very first real user (first-run setup; becomes admin), or
 * - someone holding a valid admin-issued invite.
 *
 * Set ALLOW_REGISTRATION=true to restore open sign-up. Newly registered
 * users are never admins and, by default, cannot use the shell executor
 * (see shell-access.ts).
 */
export const REGISTRATION_CLOSED_MESSAGE =
  'Registration is closed on this instance. Ask an administrator for an invite.';

export function isOpenRegistrationEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (env.ALLOW_REGISTRATION || '').trim().toLowerCase() === 'true';
}
