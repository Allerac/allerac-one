import { authenticationErrorResponse, ForbiddenError, requireCurrentUser } from '@/app/lib/auth-session';
import { assertTerminalAccess, terminalConfiguration } from '@/app/lib/claude-terminal';
import { requireTerminalUnlock, terminalReauthResponse } from '@/app/lib/terminal-unlock';
import { isTerminalProvider } from '@/app/terminal/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reads = new Set(['access', 'status', 'output']);
const writes = new Set(['start', 'input', 'resize', 'stop']);
// Operations that control or reveal a terminal session need a recent re-authentication.
const unlocked = new Set(['output', ...writes]);
const failure = (code: string, error: string, status: number) => Response.json({ error, code }, { status, headers: { 'Cache-Control': 'no-store' } });

async function proxy(request: Request, context: { params: Promise<{ operation: string }> }) {
  try {
    const user = await requireCurrentUser();
    const provider = new URL(request.url).searchParams.get('provider') || 'claude';
    if (!isTerminalProvider(provider)) return failure('unknown_provider', 'Unknown terminal provider', 400);
    assertTerminalAccess(user, provider);
    const config = terminalConfiguration(provider);
    if (request.method === 'POST') {
      const origin = request.headers.get('origin');
      if (!origin || new URL(origin).host !== request.headers.get('host')) throw new ForbiddenError('Invalid origin');
    }
    const { operation } = await context.params;
    if (!(request.method === 'GET' ? reads : writes).has(operation)) return failure('unknown_operation', 'Unknown terminal operation', 404);
    if (operation === 'access') return Response.json({ enabled: true }, { headers: { 'Cache-Control': 'no-store' } });
    if (unlocked.has(operation)) await requireTerminalUnlock(user);
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
          if (size > 32_768) { await reader.cancel(); return failure('request_too_large', 'Request too large', 413); }
          chunks.push(part.value);
        }
      }
      body = Buffer.concat(chunks).toString('utf8');
    }
    const url = new URL(`/${operation}`, config.url!);
    if (operation === 'output') url.searchParams.set('cursor', new URL(request.url).searchParams.get('cursor') || '0');
    const response = await fetch(url, {
      method: request.method, body, cache: 'no-store', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${config.secret}`, 'X-Terminal-Owner': user.id, 'Content-Type': 'application/json' },
    });
    return new Response(await response.text(), { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) {
    return terminalReauthResponse(error) || authenticationErrorResponse(error) || failure('terminal_unavailable', 'Unable to reach the terminal on this unit. Check the local bridge.', 503);
  }
}

export const GET = proxy;
export const POST = proxy;
