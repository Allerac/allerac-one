import { submitLog } from '@/lib/submit-log';

/**
 * POST /api/log-submit — Accept logs from services (Telegram, Executor, Health Worker, etc)
 *
 * No authentication required — services are in the same Docker network.
 * Logs are added to the in-memory buffer and streamed via /api/logs SSE.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const { context, message, level = 'log' } = body as {
      context?: string;
      message?: string;
      level?: 'log' | 'warn' | 'error' | 'info';
    };

    if (!context || !message) {
      return Response.json({ error: 'context and message are required' }, { status: 400 });
    }

    await submitLog(context, message, level);
    return Response.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
