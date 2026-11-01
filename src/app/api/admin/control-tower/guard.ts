/**
 * Control Tower API guard (federation P4d): session admin only, never inside a
 * public domain (sales, openworld), never reachable with an API key.
 */
import { authenticationErrorResponse, ForbiddenError, requireCurrentAdmin } from '@/app/lib/auth-session';
import type { User } from '@/app/services/auth/auth.service';
import { canUseInbox } from '@/federation/inbox-policy';

export class NotAvailableError extends Error {}

export async function requireControlTowerAdmin(request: Request): Promise<User> {
  const user = await requireCurrentAdmin();
  const domain = new URL(request.url).searchParams.get('domain');
  if (!canUseInbox(user, domain)) throw new NotAvailableError();
  return user;
}

export function towerData(data: unknown): Response {
  return Response.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
}

export function towerError(context: string, error: unknown): Response {
  // Non-admins and public domains get a plain 404: the page does not exist for them.
  if (error instanceof NotAvailableError || error instanceof ForbiddenError) {
    return Response.json({ error: { code: 'not_found', message: 'Not found' } }, { status: 404 });
  }
  const auth = authenticationErrorResponse(error);
  if (auth) return auth.status === 403 ? Response.json({ error: { code: 'not_found', message: 'Not found' } }, { status: 404 }) : auth;
  console.error(`[ControlTower] ${context}:`, error);
  return Response.json({ error: { code: 'internal_error', message: 'Internal error' } }, { status: 500 });
}
