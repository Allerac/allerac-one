/** @jest-environment node */
import { GET, POST } from '@/app/api/terminal/[operation]/route';
import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { canUseTerminal } from '@/app/lib/unit-terminal';
import pool from '@/app/clients/db';
import { requireTerminalUnlock, TerminalReauthRequiredError } from '@/app/lib/terminal-unlock';

jest.mock('@/app/lib/auth-session', () => {
  const actual = jest.requireActual('@/app/lib/auth-errors');
  return { ...actual, requireCurrentUser: jest.fn(), authenticationErrorResponse: (error: unknown) => error instanceof actual.UnauthorizedError ? Response.json({ error: 'Unauthorized' }, { status: 401 }) : error instanceof actual.ForbiddenError ? Response.json({ error: 'Forbidden' }, { status: 403 }) : null };
});
jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: jest.fn() } }));

jest.mock('@/app/lib/terminal-unlock', () => {
  const actual = jest.requireActual('@/app/lib/terminal-unlock');
  return { ...actual, requireTerminalUnlock: jest.fn() };
});

const sessionId = '22222222-2222-4222-8222-222222222222';
const member = { id: 'member', email: 'member@example.com', is_admin: false };
const context = (operation: string) => ({ params: Promise.resolve({ operation }) });
const request = (operation: string, origin = 'http://localhost:8080', body = '{}', provider = 'claude') => new Request(`http://localhost:8080/api/terminal/${operation}?provider=${provider}`, { method: 'POST', headers: { host: 'localhost:8080', origin }, body });
const mockUser = jest.mocked(requireCurrentUser);
const query = jest.mocked(pool.query) as unknown as jest.Mock;
const originalFetch = global.fetch;
const originalEnv = { ...process.env };
let granted: Set<string>;
const inserts = () => query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO terminal_session_events')).map(([, params]) => params);

beforeEach(() => {
  process.env.CLAUDE_TERMINAL_SECRET = 's'.repeat(40);
  process.env.CODEX_TERMINAL_SECRET = 'c'.repeat(40);
  delete process.env.CLAUDE_TERMINAL_URL; delete process.env.CODEX_TERMINAL_URL;
  granted = new Set(['member']);
  query.mockImplementation(async (sql: string, params: unknown[]) => String(sql).includes('user_terminal_access') ? { rowCount: granted.has(params[0] as string) ? 1 : 0, rows: [] } : { rowCount: 1, rows: [] });
  mockUser.mockResolvedValue(member as Awaited<ReturnType<typeof requireCurrentUser>>);
  jest.mocked(requireTerminalUnlock).mockResolvedValue(undefined);
  global.fetch = jest.fn().mockResolvedValue(Response.json({ ok: true }));
});
afterEach(() => { jest.resetAllMocks(); process.env = { ...originalEnv }; global.fetch = originalFetch; });

test('several users granted terminal access share it; others are refused', async () => {
  expect(await canUseTerminal(member, 'claude')).toBe(true);
  expect(await canUseTerminal({ id: 'second', is_admin: false }, 'claude')).toBe(false);
  granted.add('second');
  expect(await canUseTerminal({ id: 'second', is_admin: false }, 'claude')).toBe(true);
  mockUser.mockResolvedValue({ ...member, id: 'outsider' } as Awaited<ReturnType<typeof requireCurrentUser>>);
  expect((await GET(new Request('http://localhost/api/terminal/status'), context('status'))).status).toBe(403);
  expect(global.fetch).not.toHaveBeenCalled();
});
test('admins need an explicit grant like everyone else', async () => {
  expect(await canUseTerminal({ id: 'admin', is_admin: true }, 'codex')).toBe(false);
  granted.add('admin');
  expect(await canUseTerminal({ id: 'admin', is_admin: true }, 'codex')).toBe(true);
});
test('access is re-checked on every request, so revocation applies to the next poll', async () => {
  expect((await GET(new Request('http://localhost/api/terminal/output?cursor=0'), context('output'))).status).toBe(200);
  granted.delete('member');
  expect((await GET(new Request('http://localhost/api/terminal/output?cursor=0'), context('output'))).status).toBe(403);
});
test('requires an authenticated session and a configured service secret', async () => {
  mockUser.mockRejectedValue(new UnauthorizedError());
  expect((await GET(new Request('http://localhost/api/terminal/status'), context('status'))).status).toBe(401);
  delete process.env.CLAUDE_TERMINAL_SECRET;
  expect(await canUseTerminal(member, 'claude')).toBe(false);
});
test('rejects cross-origin writes and arbitrary terminal paths', async () => {
  expect((await POST(request('start', 'http://evil.test'), context('start'))).status).toBe(403);
  expect((await POST(request('shell'), context('shell'))).status).toBe(404);
  expect(global.fetch).not.toHaveBeenCalled();
});
test('proxies to the Unit terminal service with a server-only credential', async () => {
  const response = await POST(request('input', undefined, JSON.stringify({ id: sessionId, data: 'hello' })), context('input'));
  expect(response.status).toBe(200);
  expect(global.fetch).toHaveBeenCalledWith(new URL('http://terminal-claude:3015/input'), expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: `Bearer ${'s'.repeat(40)}` }) }));
  expect(await response.text()).not.toContain('ssssss');
});
test('limits request bodies before forwarding', async () => {
  expect((await POST(request('input', undefined, 'x'.repeat(33_000)), context('input'))).status).toBe(413);
  expect(global.fetch).not.toHaveBeenCalled();
});
test('access discovery does not contact the terminal service', async () => {
  const response = await GET(new Request('http://localhost/api/terminal/access'), context('access'));
  expect(await response.json()).toEqual({ enabled: true });
  expect(global.fetch).not.toHaveBeenCalled();
});
test('service errors produce a recoverable response without internal details', async () => {
  jest.mocked(global.fetch).mockRejectedValue(new Error('private connection details'));
  const response = await GET(new Request('http://localhost/api/terminal/status'), context('status'));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private connection');
});
test('Codex routes to its own service and credential; unknown providers fail closed', async () => {
  const response = await POST(request('start', undefined, JSON.stringify({ cols: 100, rows: 30 }), 'codex'), context('start'));
  expect(response.status).toBe(200);
  expect(global.fetch).toHaveBeenCalledWith(new URL('http://terminal-codex:3016/start'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${'c'.repeat(40)}` }) }));
  expect((await GET(new Request('http://localhost/api/terminal/status?provider=http://evil.test'), context('status'))).status).toBe(400);
});

test('records who started, reconnected and stopped a session', async () => {
  jest.mocked(global.fetch).mockResolvedValueOnce(Response.json({ id: sessionId, running: true, created: true }));
  await POST(request('start', undefined, JSON.stringify({ cols: 100, rows: 30 })), context('start'));
  jest.mocked(global.fetch).mockResolvedValueOnce(Response.json({ id: sessionId, running: true, created: false }));
  await POST(request('start', undefined, JSON.stringify({ cols: 100, rows: 30 })), context('start'));
  jest.mocked(global.fetch).mockResolvedValueOnce(Response.json({ running: false }));
  await POST(request('stop', undefined, JSON.stringify({ id: sessionId })), context('stop'));
  expect(inserts()).toEqual([
    ['claude', sessionId, 'member', 'started', null],
    ['claude', sessionId, 'member', 'reconnected', null],
    ['claude', sessionId, 'member', 'stopped', null],
  ]);
});
test('records an observed CLI exit once and never input or output', async () => {
  const ended = { id: '33333333-3333-4333-8333-333333333333', data: 'secret output', cursor: 13, running: false, endReason: 'exited', exitCode: 2 };
  jest.mocked(global.fetch).mockImplementation(async () => Response.json(ended));
  await GET(new Request('http://localhost/api/terminal/output?cursor=0'), context('output'));
  await GET(new Request('http://localhost/api/terminal/output?cursor=0'), context('output'));
  jest.mocked(global.fetch).mockResolvedValueOnce(Response.json({ ok: true }));
  await POST(request('input', undefined, JSON.stringify({ id: sessionId, data: 'typed secret' })), context('input'));
  expect(inserts()).toEqual([['claude', ended.id, null, 'exited', 2]]);
  expect(JSON.stringify(query.mock.calls)).not.toMatch(/secret/);
});

test('session control and output require a recent re-authentication; discovery and status do not', async () => {
  jest.mocked(requireTerminalUnlock).mockRejectedValue(new TerminalReauthRequiredError());
  for (const operation of ['start', 'input', 'resize', 'stop']) {
    const response = await POST(request(operation, undefined, JSON.stringify({ id: 'session', data: 'x', cols: 80, rows: 24 })), context(operation));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'reauth_required' });
  }
  expect((await GET(new Request('http://localhost/api/terminal/output?cursor=0'), context('output'))).status).toBe(403);
  expect(global.fetch).not.toHaveBeenCalled();
  expect((await GET(new Request('http://localhost/api/terminal/access'), context('access'))).status).toBe(200);
  expect((await GET(new Request('http://localhost/api/terminal/status'), context('status'))).status).toBe(200);
});

test('errors are English and carry a code the client translates', async () => {
  const response = await GET(new Request('http://localhost/api/terminal/status?provider=nope'), context('status'));
  expect(await response.json()).toEqual({ error: 'Unknown terminal provider', code: 'unknown_provider' });
  jest.mocked(global.fetch).mockRejectedValue(new Error('offline'));
  expect(await (await GET(new Request('http://localhost/api/terminal/status'), context('status'))).json()).toMatchObject({ code: 'terminal_unavailable' });
});
