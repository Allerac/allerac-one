/**
 * GET /api/logs — SSE stream of Allerac system logs
 *
 * Sends the full in-memory buffer on connect, then streams every new entry
 * in real-time. Used by the retro System Monitor terminal in the hub.
 *
 * Auth: admin session.
 */

import {
  authenticationErrorResponse,
  requireCurrentAdmin,
} from '@/app/lib/auth-session';
import { logBuffer } from '@/lib/logger';
import type { LogEntry } from '@/lib/logger-shared';

export async function GET(request: Request): Promise<Response> {
  try {
    await requireCurrentAdmin();
  } catch (error) {
    const authError = authenticationErrorResponse(error, { format: 'text' });
    if (authError) return authError;
    return new Response('Authentication failed', { status: 500 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Flush the existing buffer immediately so the terminal shows history on connect
      const history = logBuffer.getAll();
      for (const entry of history) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`));
      }

      // Subscribe to new entries
      const onEntry = (entry: LogEntry) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`));
        } catch {
          logBuffer.off('entry', onEntry);
        }
      };
      logBuffer.on('entry', onEntry);

      // Keepalive every 20s to prevent proxy/CDN timeouts
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          clearInterval(keepalive);
        }
      }, 20_000);

      // Clean up when client disconnects
      request.signal.addEventListener('abort', () => {
        logBuffer.off('entry', onEntry);
        clearInterval(keepalive);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
