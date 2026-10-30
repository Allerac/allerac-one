/** @jest-environment node */
import { requireCurrentAdmin } from '@/app/lib/auth-session';
import { inboxService } from '@/federation/inbox.instance';
import { InboxError } from '@/federation/inbox.service';
import { GET as listAgents } from '@/app/api/inbox/agents/route';
import { POST as openThread } from '@/app/api/inbox/threads/route';
import { GET as getThread } from '@/app/api/inbox/threads/[id]/route';
import { POST as sendMessage } from '@/app/api/inbox/threads/[id]/messages/route';
import { POST as retryMessage } from '@/app/api/inbox/threads/[id]/messages/[messageId]/retry/route';
import { DELETE as deleteHistory } from '@/app/api/inbox/peers/[peerId]/history/route';

jest.mock('@/app/lib/auth-session', () => {
  class MockUnauthorizedError extends Error {}
  class MockForbiddenError extends Error {}
  return {
    UnauthorizedError: MockUnauthorizedError,
    ForbiddenError: MockForbiddenError,
    requireCurrentAdmin: jest.fn(),
    authenticationErrorResponse: (error: unknown) => {
      if (error instanceof MockUnauthorizedError) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      if (error instanceof MockForbiddenError) return Response.json({ error: 'Forbidden' }, { status: 403 });
      return null;
    },
  };
});
jest.mock('@/federation/inbox.instance', () => ({
  inboxService: {
    list: jest.fn(), openThread: jest.fn(), getThread: jest.fn(), send: jest.fn(), retry: jest.fn(), deleteArchivedHistory: jest.fn(),
  },
}));

const auth = jest.mocked(requireCurrentAdmin);
const svc = jest.mocked(inboxService);
const admin = { id: 'admin-1', email: 'a@x', name: 'A', is_admin: true, created_at: new Date() };
const PEER = '11111111-1111-4111-8111-111111111111';
const json = (url: string, method: string, body?: unknown) => new Request(url, {
  method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
});

describe('/api/inbox routes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects non-admins on every route', async () => {
    const { ForbiddenError } = jest.requireMock('@/app/lib/auth-session');
    auth.mockRejectedValue(new ForbiddenError());
    const ctx = { params: Promise.resolve({ id: 't1', messageId: 'm1', peerId: PEER }) };
    const responses = await Promise.all([
      listAgents(new Request('http://x/api/inbox/agents')),
      openThread(json('http://x/api/inbox/threads', 'POST', { peerId: PEER, agent: 'chat' })),
      getThread(new Request('http://x/api/inbox/threads/t1'), ctx),
      sendMessage(json('http://x', 'POST', { content: 'hi' }), ctx),
      retryMessage(json('http://x', 'POST'), ctx),
      deleteHistory(json('http://x', 'DELETE'), ctx),
    ]);
    expect(responses.map(response => response.status)).toEqual([403, 403, 403, 403, 403, 403]);
    expect(svc.list).not.toHaveBeenCalled();
    expect(svc.send).not.toHaveBeenCalled();
    auth.mockReset();
  });

  it('is never available inside a public domain', async () => {
    auth.mockResolvedValue(admin as never);
    const response = await listAgents(new Request('http://x/api/inbox/agents?domain=sales'));
    expect(response.status).toBe(403);
    expect(svc.list).not.toHaveBeenCalled();
  });

  it('lists agents for admins', async () => {
    auth.mockResolvedValue(admin as never);
    svc.list.mockResolvedValueOnce({ home: { name: 'napols' }, units: [], archived: [] } as never);
    const response = await listAgents(new Request('http://x/api/inbox/agents?domain=chat'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect((await response.json()).data.home.name).toBe('napols');
  });

  it('validates and opens threads', async () => {
    auth.mockResolvedValue(admin as never);
    expect((await openThread(json('http://x', 'POST', { peerId: 'nope', agent: 'chat' }))).status).toBe(400);
    svc.openThread.mockResolvedValueOnce({ id: 't1' } as never);
    const response = await openThread(json('http://x', 'POST', { peerId: PEER, agent: 'chat' }));
    expect(response.status).toBe(201);
    expect((await response.json()).data).toEqual({ thread: { id: 't1' } });
    expect(svc.openThread).toHaveBeenCalledWith(admin, PEER, 'chat');
  });

  it('sends, retries and maps inbox errors', async () => {
    auth.mockResolvedValue(admin as never);
    const ctx = { params: Promise.resolve({ id: 't1', messageId: 'm1' }) };
    svc.send.mockResolvedValueOnce({ userMessage: { id: 'm1', status: 'done' }, agentMessage: null } as never);
    expect((await sendMessage(json('http://x', 'POST', { content: 'hi' }), ctx)).status).toBe(200);
    expect(svc.send).toHaveBeenCalledWith(admin, 't1', 'hi');

    svc.send.mockRejectedValueOnce(new InboxError('rate_limited', 'slow down', 429));
    const limited = await sendMessage(json('http://x', 'POST', { content: 'hi' }), ctx);
    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe('rate_limited');

    svc.retry.mockRejectedValueOnce(new InboxError('unit_not_paired', 'Unit no longer paired', 409));
    expect((await retryMessage(json('http://x', 'POST'), ctx)).status).toBe(409);
  });

  it('deletes archived history', async () => {
    auth.mockResolvedValue(admin as never);
    svc.deleteArchivedHistory.mockResolvedValueOnce(2);
    const response = await deleteHistory(json('http://x', 'DELETE'), { params: Promise.resolve({ peerId: PEER }) });
    expect((await response.json()).data).toEqual({ deleted: 2 });
  });

  it('hides internal errors', async () => {
    auth.mockResolvedValue(admin as never);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    svc.getThread.mockRejectedValueOnce(new Error('db password=secret'));
    const response = await getThread(new Request('http://x'), { params: Promise.resolve({ id: 't1' }) });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('secret');
    spy.mockRestore();
  });
});
