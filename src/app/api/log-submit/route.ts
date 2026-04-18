import { submitLog } from '@/lib/submit-log';

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
