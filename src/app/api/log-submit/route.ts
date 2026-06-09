import { submitLog } from '@/lib/submit-log';
import { authenticationErrorResponse, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';

/**
 * POST /api/log-submit — Accept logs from services (Telegram, Executor, Health Worker, etc)
 *
 * Browser callers authenticate with their session. Internal services use
 * Authorization: Bearer {EXECUTOR_SECRET}.
 * Logs are added to the in-memory buffer and streamed via /api/logs SSE.
 */
export async function POST(request: Request): Promise<Response> {
  const authorization = request.headers.get('Authorization') ?? '';
  const serviceSecret = process.env.EXECUTOR_SECRET ?? '';
  const hasServiceAccess = Boolean(
    serviceSecret && authorization === `Bearer ${serviceSecret}`
  );

  if (!hasServiceAccess) {
    try {
      await requireCurrentUser();
    } catch (error) {
      const authError = authenticationErrorResponse(error);
      if (authError) return authError;
      return Response.json({ error: 'Authentication failed' }, { status: 500 });
    }
  }

  try {
    const body = await request.json();
    const { context, message, level = 'log' } = body as {
      context?: string;
      message?: string;
      level?: 'log' | 'warn' | 'error' | 'info';
    };

    if (
      typeof context !== 'string'
      || typeof message !== 'string'
      || !context.trim()
      || !message.trim()
    ) {
      return Response.json({ error: 'context and message are required' }, { status: 400 });
    }

    const allowedLevels = new Set(['log', 'warn', 'error', 'info']);
    if (!allowedLevels.has(level)) {
      return Response.json({ error: 'Invalid log level' }, { status: 400 });
    }

    await submitLog(context.slice(0, 100), message.slice(0, 10_000), level);
    return Response.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
