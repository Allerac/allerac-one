/** @jest-environment node */
import { GET, POST, DELETE } from '@/app/api/terminal/unlock/route';
import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { checkTerminalUnlock, revokeTerminalUnlock } from '@/app/lib/terminal-unlock';
import { AuthService } from '@/app/services/auth/auth.service';

jest.mock('next/headers', () => ({ cookies: jest.fn(async () => ({ get: (name: string) => (name === 'session_token' ? { value: 'session-token' } : undefined) })) }));
jest.mock('@/app/lib/auth-session', () => {
  const errors = jest.requireActual('@/app/lib/auth-errors');
  return { ...errors, requireCurrentUser: jest.fn(), authenticationErrorResponse: (error: unknown) => error instanceof errors.UnauthorizedError ? Response.json({}, { status: 401 }) : error instanceof errors.ForbiddenError ? Response.json({}, { status: 403 }) : null };
});
jest.mock('@/app/services/auth/auth.service', () => ({ AuthService: jest.fn() }));

const prehash = 'a'.repeat(64);
const verifyUserPassword = jest.fn();
const getSessionCreatedAt = jest.fn();
const originalEnv = { ...process.env };
const request = (method: string, body?: unknown, origin = 'http://localhost:8080') => new Request('http://localhost:8080/api/terminal/unlock', { method, headers: { host: 'localhost:8080', origin }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

beforeEach(() => {
  process.env.CLAUDE_TERMINAL_URL = 'http://host.docker.internal:3015'; process.env.CLAUDE_TERMINAL_SECRET = 's'.repeat(40); process.env.CLAUDE_TERMINAL_USER_ID = 'owner';
  jest.mocked(requireCurrentUser).mockResolvedValue({ id: 'owner', is_admin: false } as Awaited<ReturnType<typeof requireCurrentUser>>);
  jest.mocked(AuthService).mockImplementation(() => ({ verifyUserPassword, getSessionCreatedAt }) as unknown as AuthService);
  verifyUserPassword.mockResolvedValue('valid');
  getSessionCreatedAt.mockResolvedValue(null);
  globalThis.__alleracOperationLimiterStore?.entries.clear();
});
afterEach(() => { jest.clearAllMocks(); revokeTerminalUnlock('session-token'); process.env = { ...originalEnv }; });

test('the correct password unlocks the current session', async () => {
  expect(await (await GET(request('GET'))).json()).toMatchObject({ unlocked: false });
  const response = await POST(request('POST', { password: prehash }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ unlocked: true });
  expect(verifyUserPassword).toHaveBeenCalledWith('owner', prehash);
  expect(checkTerminalUnlock('session-token', 'owner')).not.toBeNull();
  expect(await (await GET(request('GET'))).json()).toMatchObject({ unlocked: true });
  expect((await DELETE(request('DELETE'))).status).toBe(200);
  expect(checkTerminalUnlock('session-token', 'owner')).toBeNull();
});

test('a wrong password does not unlock and attempts are rate limited', async () => {
  verifyUserPassword.mockResolvedValue('invalid');
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await POST(request('POST', { password: prehash }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'invalid_password' });
  }
  const limited = await POST(request('POST', { password: prehash }));
  expect(limited.status).toBe(429);
  expect(await limited.json()).toMatchObject({ code: 'rate_limited' });
  expect(verifyUserPassword).toHaveBeenCalledTimes(5);
  expect(checkTerminalUnlock('session-token', 'owner')).toBeNull();
});

test('only pre-hashed passwords are accepted, from the same origin', async () => {
  expect((await POST(request('POST', { password: 'plaintext' }))).status).toBe(400);
  expect((await POST(request('POST', { password: prehash, extra: true }))).status).toBe(400);
  expect((await POST(request('POST', { password: prehash }, 'http://evil.test'))).status).toBe(403);
  expect(verifyUserPassword).not.toHaveBeenCalled();
});

test('accounts without a password unlock only from a fresh sign-in', async () => {
  verifyUserPassword.mockResolvedValue('no_password');
  getSessionCreatedAt.mockResolvedValue(new Date(Date.now() - 60 * 60_000));
  const stale = await POST(request('POST', {}));
  expect(stale.status).toBe(403);
  expect(await stale.json()).toMatchObject({ code: 'signin_required' });
  getSessionCreatedAt.mockResolvedValue(new Date(Date.now() - 60_000));
  expect((await POST(request('POST', {}))).status).toBe(200);
});

test('requires a signed-in terminal user; admins do not bypass this', async () => {
  jest.mocked(requireCurrentUser).mockResolvedValue({ id: 'admin', is_admin: true } as Awaited<ReturnType<typeof requireCurrentUser>>);
  expect((await POST(request('POST', { password: prehash }))).status).toBe(403);
  jest.mocked(requireCurrentUser).mockRejectedValue(new UnauthorizedError());
  expect((await POST(request('POST', { password: prehash }))).status).toBe(401);
  expect(verifyUserPassword).not.toHaveBeenCalled();
});
