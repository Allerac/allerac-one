/** @jest-environment node */
import { GET, POST, DELETE } from '@/app/api/terminal/connection/route';
import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { apiKeyService } from '@/app/services/api-keys/api-key.service';
import { terminalApiPolicy } from '@/app/services/terminal/terminal-api-policy';
import { requireTerminalUnlock, TerminalReauthRequiredError } from '@/app/lib/terminal-unlock';

jest.mock('@/app/lib/auth-session', () => {
  const errors = jest.requireActual('@/app/lib/auth-errors');
  return { ...errors, requireCurrentUser: jest.fn(), authenticationErrorResponse: (error: unknown) => error instanceof errors.UnauthorizedError ? Response.json({}, { status: 401 }) : error instanceof errors.ForbiddenError ? Response.json({}, { status: 403 }) : null };
});
jest.mock('@/app/services/api-keys/api-key.service', () => ({ apiKeyService: { list: jest.fn(), create: jest.fn(), revoke: jest.fn() } }));
jest.mock('@/app/services/terminal/terminal-api-policy', () => ({ terminalApiKeyName: (provider: string) => `Terminal API · ${provider}`, terminalApiPolicy: jest.fn() }));

jest.mock('@/app/lib/terminal-unlock', () => {
  const actual = jest.requireActual('@/app/lib/terminal-unlock');
  return { ...actual, requireTerminalUnlock: jest.fn() };
});

const keyId = '11111111-1111-4111-8111-111111111111';
const token = `alr_live_${'a'.repeat(64)}`;
const baseScopes = ['profile:read', 'capabilities:read', 'domains:read'];
const metadata = { connected: true, keyId, scopes: baseScopes, expiresAt: new Date(Date.now() + 86400_000).toISOString() };
const originalEnv = { ...process.env };
const originalFetch = global.fetch;
const request = (method: string, body?: unknown, origin = 'http://localhost:8080') => new Request('http://localhost:8080/api/terminal/connection?provider=codex', { method, headers: { host: 'localhost:8080', origin }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

beforeEach(() => {
  process.env.CODEX_TERMINAL_URL = 'http://host.docker.internal:3016'; process.env.CODEX_TERMINAL_SECRET = 's'.repeat(40); process.env.CODEX_TERMINAL_USER_ID = 'owner';
  jest.mocked(requireCurrentUser).mockResolvedValue({ id: 'owner', is_admin: false } as Awaited<ReturnType<typeof requireCurrentUser>>);
  jest.mocked(terminalApiPolicy).mockResolvedValue({ options: [], baseScopes, allowedScopes: baseScopes });
  jest.mocked(apiKeyService.list).mockResolvedValue([]);
  jest.mocked(apiKeyService.revoke).mockResolvedValue(true);
  jest.mocked(apiKeyService.create).mockResolvedValue({ apiKey: { id: keyId, expiresAt: new Date(metadata.expiresAt) }, secret: token } as Awaited<ReturnType<typeof apiKeyService.create>>);
  jest.mocked(requireTerminalUnlock).mockResolvedValue(undefined);
  global.fetch = jest.fn().mockImplementation(async () => Response.json({ ...metadata, token }));
});
afterEach(() => { jest.resetAllMocks(); global.fetch = originalFetch; process.env = { ...originalEnv }; });

test('creates a short-lived scoped key and installs it on the bridge without exposing it to the browser', async () => {
  const response = await POST(request('POST', {}));
  expect(response.status).toBe(201);
  expect(apiKeyService.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner', name: 'Terminal API · codex', scopes: baseScopes }));
  expect(global.fetch).toHaveBeenCalledWith(new URL('http://host.docker.internal:3016/api-connection'), expect.objectContaining({ body: expect.stringContaining(token) }));
  expect(await response.text()).not.toContain(token);
});
test('does not grant arbitrary scopes, even for the terminal owner', async () => {
  expect((await POST(request('POST', { scopes: ['email:write'] }))).status).toBe(403);
  expect(apiKeyService.create).not.toHaveBeenCalled();
});
test('requires the owning session and same-origin consent', async () => {
  expect((await POST(request('POST', {}, 'http://evil.test'))).status).toBe(403);
  jest.mocked(requireCurrentUser).mockResolvedValue({ id: 'other-admin', is_admin: true } as Awaited<ReturnType<typeof requireCurrentUser>>);
  expect((await GET(request('GET'))).status).toBe(403);
  jest.mocked(requireCurrentUser).mockRejectedValue(new UnauthorizedError());
  expect((await DELETE(request('DELETE'))).status).toBe(401);
  expect(apiKeyService.create).not.toHaveBeenCalled();
});
test('revokes a newly created key if installing the connection fails', async () => {
  jest.mocked(global.fetch).mockRejectedValue(new Error('bridge offline'));
  expect((await POST(request('POST', {}))).status).toBe(503);
  expect(apiKeyService.revoke).toHaveBeenCalledWith({ userId: 'owner', keyId });
});
test('disconnect revokes access even when the bridge is offline and leaves unrelated keys alone', async () => {
  jest.mocked(apiKeyService.list).mockResolvedValue([{ id: keyId, name: 'Terminal API · codex', revokedAt: null }, { id: 'unrelated', name: 'Other', revokedAt: null }] as Awaited<ReturnType<typeof apiKeyService.list>>);
  jest.mocked(global.fetch).mockRejectedValue(new Error('offline'));
  const response = await DELETE(request('DELETE'));
  expect(response.status).toBe(200); expect(apiKeyService.revoke).toHaveBeenCalledTimes(1);
  expect(await response.json()).toMatchObject({ connection: { connected: false }, bridgeCleared: false });
});
test('reports a revoked or missing key as disconnected regardless of bridge metadata', async () => {
  const response = await GET(request('GET'));
  expect(await response.json()).toMatchObject({ connection: { connected: false } });
});

test('granting API access requires a recent re-authentication, revoking does not', async () => {
  jest.mocked(requireTerminalUnlock).mockRejectedValue(new TerminalReauthRequiredError());
  const response = await POST(request('POST', {}));
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: 'reauth_required' });
  expect(apiKeyService.create).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
  expect((await DELETE(request('DELETE'))).status).toBe(200);
  expect((await GET(request('GET'))).status).toBe(200);
});
