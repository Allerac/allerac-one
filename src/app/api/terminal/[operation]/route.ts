import { authenticationErrorResponse, ForbiddenError, requireCurrentUser } from '@/app/lib/auth-session';
import { assertTerminalAccess, terminalConfiguration } from '@/app/lib/unit-terminal';
import { isTerminalProvider, type TerminalProvider } from '@/app/terminal/providers';
import { recordObservedEnd, recordTerminalEvent } from '@/app/services/terminal/terminal-session-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reads = new Set(['access', 'status', 'output']);
const writes = new Set(['start', 'input', 'resize', 'stop']);

function parse(text: string | undefined): Record<string, unknown> | null {
  try { const value = JSON.parse(text || ''); return value && typeof value === 'object' ? value : null; } catch { return null; }
}

/** Lifecycle history only: never the input sent or the output received. */
async function recordLifecycle(operation: string, provider: TerminalProvider, userId: string, requestBody: string | undefined, responseText: string) {
  const result = parse(responseText);
  if (!result) return;
  if (operation === 'start') {
    await recordTerminalEvent({ provider, sessionId: result.id, userId, event: result.created === true ? 'started' : 'reconnected' });
  } else if (operation === 'stop') {
    await recordTerminalEvent({ provider, sessionId: parse(requestBody)?.id, userId, event: 'stopped' });
  } else if (operation === 'status' || operation === 'output') {
    await recordObservedEnd(provider, result);
  }
}

async function proxy(request: Request, context: { params: Promise<{ operation: string }> }) {
  try {
    const user = await requireCurrentUser();
    const provider = new URL(request.url).searchParams.get('provider') || 'claude';
    if (!isTerminalProvider(provider)) return Response.json({ error: 'Unknown terminal provider' }, { status: 400 });
    // Checked on every request: revoking access takes effect on the next poll or keystroke.
    await assertTerminalAccess(user, provider);
    const config = terminalConfiguration(provider);
    if (request.method === 'POST') {
      const origin = request.headers.get('origin');
      if (!origin || new URL(origin).host !== request.headers.get('host')) throw new ForbiddenError('Invalid origin');
    }
    const { operation } = await context.params;
    if (!(request.method === 'GET' ? reads : writes).has(operation)) return Response.json({ error: 'Unknown terminal operation' }, { status: 404 });
    if (operation === 'access') return Response.json({ enabled: true }, { headers: { 'Cache-Control': 'no-store' } });
    let body: string | undefined;
    if (request.method === 'POST') {
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 32_768) { await reader.cancel(); return Response.json({ error: 'Request too large' }, { status: 413 }); }
          chunks.push(part.value);
        }
      }
      body = Buffer.concat(chunks).toString('utf8');
    }
    const url = new URL(`/${operation}`, config.url!);
    if (operation === 'output') url.searchParams.set('cursor', new URL(request.url).searchParams.get('cursor') || '0');
    const response = await fetch(url, {
      method: request.method, body, cache: 'no-store', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' },
    });
    const text = await response.text();
    if (response.ok && operation !== 'input' && operation !== 'resize') await recordLifecycle(operation, provider, user.id, body, text);
    return new Response(text, { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) {
    return authenticationErrorResponse(error) || Response.json({ error: 'Não foi possível acessar o terminal nesta unit. Verifique o serviço de terminal.' }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
