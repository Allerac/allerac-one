import { z } from 'zod';
import { authenticationErrorResponse, ForbiddenError, requireCurrentUser } from '@/app/lib/auth-session';
import { canUseTerminal } from '@/app/lib/claude-terminal';
import { acquireOperationLimit } from '@/app/lib/operation-limiter';
import { isPrehashedPassword } from '@/app/lib/password-prehash';
import {
  checkTerminalUnlock, currentSessionToken, grantTerminalUnlock, revokeTerminalUnlock, TERMINAL_RECENT_SIGN_IN_MS,
} from '@/app/lib/terminal-unlock';
import { AuthService } from '@/app/services/auth/auth.service';
import { TERMINAL_PROVIDERS } from '@/app/terminal/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const unlockSchema = z.object({ password: z.string().max(128).optional() }).strict();
const failure = (code: string, error: string, status: number, headers: Record<string, string> = {}) =>
  Response.json({ error, code }, { status, headers: { ...noStore, ...headers } });

async function handle(request: Request) {
  try {
    const user = await requireCurrentUser();
    if (!TERMINAL_PROVIDERS.some(provider => canUseTerminal(user, provider))) throw new ForbiddenError('Terminal access is not enabled for this user');
    const token = await currentSessionToken();
    if (!token) return failure('reauth_required', 'Recent sign-in required', 401);
    if (request.method === 'GET') {
      const expiresAt = checkTerminalUnlock(token, user.id);
      return Response.json({ unlocked: Boolean(expiresAt), expiresAt: expiresAt?.toISOString() ?? null }, { headers: noStore });
    }
    const origin = request.headers.get('origin');
    if (!origin || new URL(origin).host !== request.headers.get('host')) throw new ForbiddenError('Invalid origin');
    if (request.method === 'DELETE') {
      revokeTerminalUnlock(token);
      return Response.json({ unlocked: false, expiresAt: null }, { headers: noStore });
    }

    const text = await request.text();
    if (text.length > 1024) return failure('invalid_request', 'Invalid request', 400);
    let body;
    try { body = unlockSchema.safeParse(JSON.parse(text || '{}')); } catch { return failure('invalid_request', 'Invalid request', 400); }
    if (!body.success || (body.data.password !== undefined && !isPrehashedPassword(body.data.password))) return failure('invalid_request', 'Invalid request', 400);

    const limit = acquireOperationLimit('terminal-unlock', user.id);
    if (!limit.allowed) return failure('rate_limited', 'Too many attempts. Try again later.', 429, limit.headers);
    try {
      const auth = new AuthService();
      const verdict = await auth.verifyUserPassword(user.id, body.data.password ?? '');
      if (verdict === 'no_password') {
        // Accounts without a password (e.g. Google sign-in) prove presence by a fresh sign-in.
        const createdAt = await auth.getSessionCreatedAt(token, user.id);
        if (!createdAt || Date.now() - createdAt.getTime() >= TERMINAL_RECENT_SIGN_IN_MS) return failure('signin_required', 'Sign in again to continue', 403);
      } else if (verdict !== 'valid') {
        return failure('invalid_password', 'Incorrect password', 403);
      }
      const expiresAt = grantTerminalUnlock(token, user.id);
      return Response.json({ unlocked: true, expiresAt: expiresAt.toISOString() }, { headers: noStore });
    } finally { limit.lease.release(); }
  } catch (error) {
    return authenticationErrorResponse(error) || failure('unlock_unavailable', 'Unable to confirm your identity right now', 503);
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
