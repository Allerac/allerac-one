/** @jest-environment node */
import { GET, POST } from '@/app/api/terminal/[operation]/route';
import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { canUseClaudeTerminal } from '@/app/lib/claude-terminal';

jest.mock('@/app/lib/auth-session', () => {
  const actual = jest.requireActual('@/app/lib/auth-errors');
  return { ...actual, requireCurrentUser: jest.fn(), authenticationErrorResponse: (error: unknown) => error instanceof actual.UnauthorizedError ? Response.json({ error: 'Unauthorized' }, { status: 401 }) : error instanceof actual.ForbiddenError ? Response.json({ error: 'Forbidden' }, { status: 403 }) : null };
});

const user = { id: 'owner', email: 'owner@example.com', is_admin: false };
const context = (operation: string) => ({ params: Promise.resolve({ operation }) });
const request = (operation: string, origin = 'http://localhost:8080', body = '{}') => new Request(`http://localhost:8080/api/terminal/${operation}`, { method: 'POST', headers: { host: 'localhost:8080', origin }, body });
const mockUser = jest.mocked(requireCurrentUser);
const originalFetch = global.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.CLAUDE_TERMINAL_URL = 'http://host.docker.internal:3015';
  process.env.CLAUDE_TERMINAL_SECRET = 's'.repeat(40);
  process.env.CLAUDE_TERMINAL_USER_ID = 'owner';
  process.env.CODEX_TERMINAL_URL = 'http://host.docker.internal:3016';
  process.env.CODEX_TERMINAL_SECRET = 'c'.repeat(40);
  process.env.CODEX_TERMINAL_USER_ID = 'owner';
  mockUser.mockResolvedValue(user as Awaited<ReturnType<typeof requireCurrentUser>>);
  global.fetch = jest.fn().mockResolvedValue(Response.json({ ok: true }));
});
afterEach(() => { jest.resetAllMocks(); process.env = { ...originalEnv }; global.fetch = originalFetch; });

test('only the configured user can access the terminal; admins do not bypass this', async () => {
  expect(canUseClaudeTerminal(user)).toBe(true);
  mockUser.mockResolvedValue({ ...user, id: 'admin', is_admin: true } as Awaited<ReturnType<typeof requireCurrentUser>>);
  expect((await GET(new Request('http://localhost/api/terminal/status'), context('status'))).status).toBe(403);
  expect(global.fetch).not.toHaveBeenCalled();
});
test('requires an authenticated session and explicit configuration', async () => {
  mockUser.mockRejectedValue(new UnauthorizedError());
  expect((await GET(new Request('http://localhost/api/terminal/status'), context('status'))).status).toBe(401);
  delete process.env.CLAUDE_TERMINAL_USER_ID;
  expect(canUseClaudeTerminal(user)).toBe(false);
});
test('rejects cross-origin writes and arbitrary bridge paths', async () => {
  expect((await POST(request('start', 'http://evil.test'), context('start'))).status).toBe(403);
  expect((await POST(request('shell'), context('shell'))).status).toBe(404);
  expect(global.fetch).not.toHaveBeenCalled();
});
test('proxies writes with a server-only credential and the authenticated owner', async () => {
  const response = await POST(request('input', undefined, JSON.stringify({ id: 'session', data: 'hello' })), context('input'));
  expect(response.status).toBe(200);
  expect(global.fetch).toHaveBeenCalledWith(new URL('http://host.docker.internal:3015/input'), expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: `Bearer ${'s'.repeat(40)}`, 'X-Terminal-Owner': 'owner' }) }));
  expect(await response.text()).not.toContain('ssssss');
});
test('limits request bodies before forwarding to the bridge', async () => {
  expect((await POST(request('input', undefined, 'x'.repeat(33_000)), context('input'))).status).toBe(413);
  expect(global.fetch).not.toHaveBeenCalled();
});
test('access discovery does not contact or start Claude Code', async () => {
  const response = await GET(new Request('http://localhost/api/terminal/access'), context('access'));
  expect(await response.json()).toEqual({ enabled: true });
  expect(global.fetch).not.toHaveBeenCalled();
});
test('bridge errors produce a recoverable response without internal details', async () => {
  jest.mocked(global.fetch).mockRejectedValue(new Error('private connection details'));
  const response = await GET(new Request('http://localhost/api/terminal/status'), context('status'));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private connection');
});

test('provider selection routes Codex to its own bridge and credential', async () => {
  const response = await POST(new Request('http://localhost:8080/api/terminal/start?provider=codex', { method: 'POST', headers: { host: 'localhost:8080', origin: 'http://localhost:8080' }, body: JSON.stringify({ cols: 100, rows: 30 }) }), context('start'));
  expect(response.status).toBe(200);
  expect(global.fetch).toHaveBeenCalledWith(new URL('http://host.docker.internal:3016/start'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${'c'.repeat(40)}`, 'X-Terminal-Owner': 'owner' }) }));
});

test('Codex authorization is independent from Claude and unknown providers fail closed', async () => {
  process.env.CODEX_TERMINAL_USER_ID = 'other';
  expect((await GET(new Request('http://localhost/api/terminal/status?provider=codex'), context('status'))).status).toBe(403);
  expect((await GET(new Request('http://localhost/api/terminal/status?provider=http://evil.test'), context('status'))).status).toBe(400);
  expect(global.fetch).not.toHaveBeenCalled();
});
