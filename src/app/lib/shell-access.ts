/**
 * Shell / executor access for Next.js routes and server actions.
 *
 * The policy itself lives in shell-policy.ts (re-exported here) so that the
 * agent-worker and Telegram bundles can use it without pulling in the
 * session code (next/headers, bcrypt). Import from '@/app/lib/shell-policy'
 * in code that runs outside Next.js.
 */
import { ForbiddenError, requireCurrentUser } from '@/app/lib/auth-session';
import type { User } from '@/app/services/auth/auth.service';
import { isShellAllowedFor, shellAccessDeniedMessage } from '@/app/lib/shell-policy';

export * from '@/app/lib/shell-policy';

/** Session helper for routes: 401 without a session, 403 without shell access. */
export async function requireShellUser(): Promise<User> {
  const user = await requireCurrentUser();
  if (!isShellAllowedFor(user)) {
    throw new ForbiddenError(shellAccessDeniedMessage());
  }
  return user;
}
