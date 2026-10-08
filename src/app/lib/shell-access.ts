/**
 * Shell / executor access policy.
 *
 * The executor runs arbitrary bash. Any code path that reaches it (the
 * /api/workspace/* routes, the execute_shell and edit_file chat tools, the
 * Telegram / scheduled-job chat handler and agent-run workers) must call one
 * of the helpers below first.
 *
 * Policy (fail closed):
 * - Admin users are allowed.
 * - Non-admin users are denied, unless their user id is listed in
 *   SHELL_ALLOWED_USER_IDS (comma-separated user UUIDs). The list is matched
 *   on the immutable user id on purpose: there is no e-mail verification, so
 *   an e-mail based allowlist could be claimed by whoever registers first.
 * - If the user's role cannot be determined (missing user, DB error), deny.
 *
 * The workspace path checks in workspace-paths.ts only pin the working
 * directory; they are not a sandbox. This policy is the real gate.
 */
import pool from '@/app/clients/db';
import { ForbiddenError, requireCurrentUser } from '@/app/lib/auth-session';
import type { User } from '@/app/services/auth/auth.service';

/** Tools whose implementation calls the executor. */
export const SHELL_TOOL_NAMES = ['execute_shell', 'edit_file'];

export const SHELL_ACCESS_DENIED_MESSAGE =
  'Shell access is restricted to administrators on this instance.';

export interface ShellAccessSubject {
  id?: string | null;
  is_admin?: boolean | null;
}

function allowedUserIds(env: Record<string, string | undefined>): Set<string> {
  return new Set(
    (env.SHELL_ALLOWED_USER_IDS || '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Pure policy check. Anything other than an explicit admin or allowlisted id is denied. */
export function isShellAllowedFor(
  subject: ShellAccessSubject | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!subject || !subject.id) return false;
  if (subject.is_admin === true) return true;
  return allowedUserIds(env).has(String(subject.id).toLowerCase());
}

/**
 * Policy check for code paths that only know the user id (Telegram,
 * scheduled jobs). Looks the role up in the database and fails closed.
 */
export async function canUserIdUseShell(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const result = await pool.query<{ id: string; is_admin: boolean }>(
      'SELECT id, is_admin FROM users WHERE id = $1',
      [userId],
    );
    const row = result?.rows?.[0];
    if (!row) return false;
    return isShellAllowedFor({ id: row.id, is_admin: row.is_admin });
  } catch (error) {
    console.error('[ShellAccess] Could not determine user role, denying shell access:', error);
    return false;
  }
}

/** Session helper for routes: 401 without a session, 403 without shell access. */
export async function requireShellUser(): Promise<User> {
  const user = await requireCurrentUser();
  if (!isShellAllowedFor(user)) {
    throw new ForbiddenError(SHELL_ACCESS_DENIED_MESSAGE);
  }
  return user;
}

/** Removes executor-backed tools from a tool definition list. */
export function withoutShellTools<T extends { function?: { name?: string } }>(tools: T[]): T[] {
  return tools.filter(tool => !SHELL_TOOL_NAMES.includes(tool.function?.name ?? ''));
}
