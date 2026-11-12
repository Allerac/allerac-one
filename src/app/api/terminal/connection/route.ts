import { z } from 'zod';
import { requireCurrentUser, authenticationErrorResponse, ForbiddenError } from '@/app/lib/auth-session';
import { assertTerminalAccess, terminalConfiguration } from '@/app/lib/claude-terminal';
import { requireTerminalUnlock, terminalReauthResponse } from '@/app/lib/terminal-unlock';
import { isTerminalProvider } from '@/app/terminal/providers';
import { apiKeyService } from '@/app/services/api-keys/api-key.service';
import { terminalApiKeyName, terminalApiPolicy } from '@/app/services/terminal/terminal-api-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const metadata = z.object({ connected: z.boolean(), keyId: z.string().uuid().nullable(), scopes: z.array(z.string()), expiresAt: z.string().nullable() });
const connectSchema = z.object({ scopes: z.array(z.string()).max(40).optional() }).strict();
const failure = (code: string, error: string, status: number) => Response.json({ error, code }, { status, headers: { 'Cache-Control': 'no-store' } });
const disconnected = { connected: false, keyId: null, scopes: [], expiresAt: null };

async function handle(request: Request) {
  try {
    const user = await requireCurrentUser();
    const provider = new URL(request.url).searchParams.get('provider');
    if (!isTerminalProvider(provider)) return failure('unknown_provider', 'Unknown terminal provider', 400);
    assertTerminalAccess(user, provider);
    if (request.method !== 'GET') {
      const origin = request.headers.get('origin');
      if (!origin || new URL(origin).host !== request.headers.get('host')) throw new ForbiddenError('Invalid origin');
    }
    // Granting API access needs a recent re-authentication; revoking it never does.
    if (request.method === 'POST') await requireTerminalUnlock(user);
    const config = terminalConfiguration(provider);
    const bridge = async (method: string, body?: object) => {
      const response = await fetch(new URL('/api-connection', config.url!), { method, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${config.secret}`, 'X-Terminal-Owner': user.id, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!response.ok) throw new Error('Bridge connection unavailable');
      return metadata.parse(await response.json());
    };
    const name = terminalApiKeyName(provider);
    const keys = (await apiKeyService.list(user.id)).filter(key => key.name === name && !key.revokedAt);
    const noStore = { 'Cache-Control': 'no-store' };
    if (request.method === 'DELETE') {
      // Revoke first: access stops even if the host bridge is unavailable.
      await Promise.all(keys.map(key => apiKeyService.revoke({ userId: user.id, keyId: key.id })));
      let bridgeCleared = true;
      try { await bridge('DELETE'); } catch { bridgeCleared = false; }
      return Response.json({ connection: disconnected, bridgeCleared }, { headers: noStore });
    }
    const policy = await terminalApiPolicy(user);
    if (request.method === 'GET') {
      const connection = await bridge('GET');
      const key = keys.find(key => key.id === connection.keyId);
      const live = Boolean(key && (!key.expiresAt || key.expiresAt.getTime() > Date.now()));
      return Response.json({ connection: { ...connection, connected: connection.connected && live }, options: policy.options, baseScopes: policy.baseScopes }, { headers: noStore });
    }
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    if (reader) while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 8192) { await reader.cancel(); return failure('request_too_large', 'Request too large', 413); }
      chunks.push(part.value);
    }
    let body;
    try { body = connectSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
    catch { return failure('invalid_request', 'Invalid request', 400); }
    if (!body.success) return failure('invalid_request', 'Invalid request', 400);
    const scopes = [...new Set([...policy.baseScopes, ...(body.data.scopes || [])])];
    if (scopes.some(scope => !policy.allowedScopes.includes(scope))) return failure('scope_not_allowed', 'Access not allowed for this user', 403);
    const created = await apiKeyService.create({ userId: user.id, name, scopes, expiresAt: new Date(Date.now() + 30 * 86400_000) });
    let connection;
    try { connection = await bridge('POST', { keyId: created.apiKey.id, token: created.secret, scopes, expiresAt: created.apiKey.expiresAt!.toISOString() }); }
    catch {
      await apiKeyService.revoke({ userId: user.id, keyId: created.apiKey.id });
      return failure('install_failed', 'Unable to install the connection on the terminal. The new key was revoked.', 503);
    }
    // Rotate only keys belonging to this user's managed connection for this provider.
    await Promise.all(keys.map(key => apiKeyService.revoke({ userId: user.id, keyId: key.id })));
    return Response.json({ connection }, { status: 201, headers: noStore });
  } catch (error) {
    return terminalReauthResponse(error) || authenticationErrorResponse(error) || failure('connection_unavailable', 'Unable to reach the API connection. Check the local bridge.', 503);
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
