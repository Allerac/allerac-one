/**
 * Unified inbox routes (federation P4a): session auth, admin only, never inside
 * a public domain. Not part of /api/v1 and never reachable with an API key.
 */
import { authenticationErrorResponse, ForbiddenError, requireCurrentAdmin } from '@/app/lib/auth-session';
import type { User } from '@/app/services/auth/auth.service';
import { canUseInbox } from '@/federation/inbox-policy';
import { InboxError } from '@/federation/inbox.service';

export async function requireInboxUser(request: Request): Promise<User> {
  const user = await requireCurrentAdmin();
  const domain = new URL(request.url).searchParams.get('domain');
  if (!canUseInbox(user, domain)) throw new ForbiddenError('Inbox is not available here');
  return user;
}

export function inboxData(data: unknown, status = 200): Response {
  return Response.json({ data }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function inboxErrorResponse(context: string, error: unknown): Response {
  if (error instanceof InboxError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  const auth = authenticationErrorResponse(error);
  if (auth) return auth;
  console.error(`[Inbox] ${context}:`, error);
  return Response.json({ error: { code: 'internal_error', message: 'Internal error' } }, { status: 500 });
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
