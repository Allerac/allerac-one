/** @jest-environment node */
import { GET, POST, DELETE } from '@/app/api/terminal/connection/route';
import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { apiKeyService } from '@/app/services/api-keys/api-key.service';
import { terminalApiPolicy } from '@/app/services/terminal/terminal-api-policy';
import { ensureTerminalServiceAccount, findTerminalServiceAccount, syncTerminalServiceAccountDomains } from '@/app/services/terminal/terminal-service-account';
import { requireTerminalUnlock, TerminalReauthRequiredError } from '@/app/lib/terminal-unlock';

jest.mock('@/app/lib/auth-session', () => {
  const errors = jest.requireActual('@/app/lib/auth-errors');
  return { ...errors, requireCurrentUser: jest.fn(), authenticationErrorResponse: (error: unknown) => error instanceof errors.UnauthorizedError ? Response.json({}, { status: 401 }) : error instanceof errors.ForbiddenError ? Response.json({}, { status: 403 }) : null };
});
jest.mock('@/app/services/api-keys/api-key.service', () => ({ apiKeyService: { list: jest.fn(), create: jest.fn(), revoke: jest.fn() } }));
jest.mock('@/app/services/terminal/terminal-api-policy', () => ({ terminalApiKeyName: (provider: string) => `Terminal API · ${provider}`, terminalApiPolicy: jest.fn() }));
jest.mock('@/app/services/terminal/terminal-service-account', () => ({ ensureTerminalServiceAccount: jest.fn(), findTerminalServiceAccount: jest.fn(), syncTerminalServiceAccountDomains: jest.fn() }));

jest.mock('@/app/lib/terminal-unlock', () => {
  const actual = jest.requireActual('@/app/lib/terminal-unlock');
  return { ...actual, requireTerminalUnlock: jest.fn() };
});

const keyId = '11111111-1111-4111-8111-111111111111';
const token = `alr_live_${'a'.repeat(64)}`;
const service = 'service-account';
const baseScopes = ['profile:read', 'capabilities:read', 'domains:read'];
const metadata = { connected: true, keyId, scopes: baseScopes, expiresAt: new Date(Date.now() + 86400_000).toISOString() };
const originalEnv = { ...process.env };
const originalFetch = global.fetch;
const asUser = (value: object) => jest.mocked(requireCurrentUser).mockResolvedValue(value as Awaited<ReturnType<typeof requireCurrentUser>>);
const request = (method: string, body?: unknown, origin = 'http://localhost:8080') => new Request('http://localhost:8080/api/terminal/connection?provider=codex', { method, headers: { host: 'localhost:8080', origin }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

beforeEach(() => {
  process.env.CODEX_TERMINAL_SECRET = 's'.repeat(40); delete process.env.CODEX_TERMINAL_URL;
  asUser({ id: 'admin', is_admin: true });
  jest.mocked(terminalApiPolicy).mockResolvedValue({ options: [], baseScopes, allowedScopes: [...baseScopes, 'notes:read'] });
  jest.mocked(ensureTerminalServiceAccount).mockResolvedValue(service);
  jest.mocked(findTerminalServiceAccount).mockResolvedValue(service);
  jest.mocked(apiKeyService.list).mockResolvedValue([]);
  jest.mocked(apiKeyService.revoke).mockResolvedValue(true);
  jest.mocked(apiKeyService.create).mockResolvedValue({ apiKey: { id: keyId, expiresAt: new Date(metadata.expiresAt) }, secret: token } as Awaited<ReturnType<typeof apiKeyService.create>>);
  jest.mocked(requireTerminalUnlock).mockResolvedValue(undefined);
  global.fetch = jest.fn().mockImplementation(async () => Response.json({ ...metadata, token }));
});
afterEach(() => { jest.resetAllMocks(); global.fetch = originalFetch; process.env = { ...originalEnv }; });

test('an admin installs a short-lived key of the Unit service account, never exposed to the browser', async () => {
  const response = await POST(request('POST', { scopes: ['notes:read'] }));
  expect(response.status).toBe(201);
  expect(apiKeyService.create).toHaveBeenCalledWith(expect.objectContaining({ userId: service, name: 'Terminal API · codex', scopes: [...baseScopes, 'notes:read'] }));
  expect(global.fetch).toHaveBeenCalledWith(new URL('http://terminal-codex:3016/api-connection'), expect.objectContaining({ body: expect.stringContaining(token) }));
  expect(syncTerminalServiceAccountDomains).toHaveBeenCalledWith(service);
  expect(await response.text()).not.toContain(token);
});
test('rotation revokes only the previous keys of this provider', async () => {
  jest.mocked(apiKeyService.list).mockResolvedValue([{ id: 'old', name: 'Terminal API · codex', revokedAt: null }, { id: 'claude', name: 'Terminal API · claude', revokedAt: null }] as Awaited<ReturnType<typeof apiKeyService.list>>);
  await POST(request('POST', {}));
  expect(apiKeyService.revoke).toHaveBeenCalledTimes(1);
  expect(apiKeyService.revoke).toHaveBeenCalledWith({ userId: service, keyId: 'old' });
});
test('does not grant scopes outside the policy', async () => {
  expect((await POST(request('POST', { scopes: ['email:write'] }))).status).toBe(403);
  expect(apiKeyService.create).not.toHaveBeenCalled();
});
test('only admins configure it, with same-origin consent', async () => {
  expect((await POST(request('POST', {}, 'http://evil.test'))).status).toBe(403);
  asUser({ id: 'member', is_admin: false });
  expect((await GET(request('GET'))).status).toBe(403);
  expect((await POST(request('POST', {}))).status).toBe(403);
  jest.mocked(requireCurrentUser).mockRejectedValue(new UnauthorizedError());
  expect((await DELETE(request('DELETE'))).status).toBe(401);
  expect(apiKeyService.create).not.toHaveBeenCalled();
  expect(ensureTerminalServiceAccount).not.toHaveBeenCalled();
});
test('revokes a newly created key if installing it fails', async () => {
  jest.mocked(global.fetch).mockRejectedValue(new Error('terminal offline'));
  expect((await POST(request('POST', {}))).status).toBe(503);
  expect(apiKeyService.revoke).toHaveBeenCalledWith({ userId: service, keyId });
});
test('disconnect revokes access even when the terminal is offline and leaves unrelated keys alone', async () => {
  jest.mocked(apiKeyService.list).mockResolvedValue([{ id: keyId, name: 'Terminal API · codex', revokedAt: null }, { id: 'unrelated', name: 'Other', revokedAt: null }] as Awaited<ReturnType<typeof apiKeyService.list>>);
  jest.mocked(global.fetch).mockRejectedValue(new Error('offline'));
  const response = await DELETE(request('DELETE'));
  expect(response.status).toBe(200); expect(apiKeyService.revoke).toHaveBeenCalledTimes(1);
  expect(syncTerminalServiceAccountDomains).toHaveBeenCalledWith(service);
  expect(await response.json()).toMatchObject({ connection: { connected: false }, bridgeCleared: false });
});
test('reports a revoked or missing key as disconnected and does not create the account on read', async () => {
  jest.mocked(findTerminalServiceAccount).mockResolvedValue(null);
  const response = await GET(request('GET'));
  expect(await response.json()).toMatchObject({ connection: { connected: false } });
  expect(ensureTerminalServiceAccount).not.toHaveBeenCalled();
});
test('an unconfigured provider is not available', async () => {
  delete process.env.CODEX_TERMINAL_SECRET;
  expect((await GET(request('GET'))).status).toBe(404);
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
