/** @jest-environment node */

import { requireCurrentUser } from '@/app/lib/auth-session';
import { apiKeyService } from '@/app/services/api-keys/api-key.service';
import { agentsService } from '@/federation/agents.instance';
import { FederationRateLimitedError } from '@/federation/agents.service';
import { federationAuditRepository } from '@/federation/audit.repository';
import { GET as listAgents } from '@/app/api/v1/federation/agents/route';
import { POST as askAgent } from '@/app/api/v1/federation/agents/[agent]/ask/route';
import { GET as askResult } from '@/app/api/v1/federation/asks/[key]/route';
import { FederationError } from '@/federation/errors';
import { GET as peerAudit } from '@/app/api/v1/peers/[id]/audit/route';

jest.mock('@/app/lib/auth-session', () => {
  class MockUnauthorizedError extends Error {}
  class MockForbiddenError extends Error {}
  return {
    UnauthorizedError: MockUnauthorizedError,
    ForbiddenError: MockForbiddenError,
    requireCurrentUser: jest.fn(),
    assertDomainAccess: jest.fn(),
  };
});
jest.mock('@/app/services/api-keys/api-key.service', () => ({
  ApiKeyMissingScopeError: class extends Error {},
  apiKeyService: { validateBearerToken: jest.fn() },
}));
jest.mock('@/federation/agents.instance', () => ({
  agentsService: { listAgentsWithUnit: jest.fn(), ask: jest.fn(), askAsync: jest.fn(), getAskResult: jest.fn() },
}));
jest.mock('@/federation/audit.repository', () => ({
  federationAuditRepository: { listForPeer: jest.fn().mockResolvedValue([]) },
}));

const validate = jest.mocked(apiKeyService.validateBearerToken);
const svc = jest.mocked(agentsService);
const serviceCaller = {
  id: 'user-b', email: 'b@example.com', name: 'B', is_admin: false, created_at: new Date(),
  principal: { id: 'principal-1', name: 'peer:napols', kind: 'peer' },
};
const auth = { Authorization: 'Bearer alr_live_service' };
const askCtx = { params: Promise.resolve({ agent: 'Health' }) };
const post = (body: unknown) => new Request('http://x/api/v1/federation/agents/Health/ask', {
  method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('federation agents routes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists agents for a service caller with the list scope', async () => {
    validate.mockResolvedValueOnce(serviceCaller as never);
    svc.listAgentsWithUnit.mockResolvedValueOnce({ agents: [{ id: 'health', name: 'Health', description: null }], unit: null });
    const response = await listAgents(new Request('http://x', { headers: auth }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { agents: [{ id: 'health', name: 'Health', description: null }], unit: null, protocol: { ask: 2 } } });
    expect(validate).toHaveBeenCalledWith('alr_live_service', 'federation:agents:list');
    expect(svc.listAgentsWithUnit).toHaveBeenCalledWith('principal-1', 'user-b');
  });

  it('rejects personal keys and missing keys', async () => {
    validate.mockResolvedValueOnce({ ...serviceCaller, principal: undefined } as never);
    expect((await listAgents(new Request('http://x', { headers: auth }))).status).toBe(403);
    validate.mockResolvedValueOnce(null as never);
    expect((await listAgents(new Request('http://x', { headers: auth }))).status).toBe(401);
    expect(svc.listAgentsWithUnit).not.toHaveBeenCalled();
  });

  it('asks an agent with a validated question', async () => {
    validate.mockResolvedValueOnce(serviceCaller as never);
    svc.ask.mockResolvedValueOnce({ answer: 'ok', truncated: false, conversation_id: null, message_id: null });
    const response = await askAgent(post({ question: '  hi  ' }), askCtx);
    expect(response.status).toBe(200);
    expect(validate).toHaveBeenCalledWith('alr_live_service', 'federation:agents:ask');
    expect(svc.ask).toHaveBeenCalledWith({
      principalId: 'principal-1', actingUserId: 'user-b', agent: 'health', question: 'hi',
      conversationId: undefined, threadTitle: null, idempotencyKey: null,
    });
  });

  it('passes conversation_id, thread_title and Idempotency-Key through (P4b)', async () => {
    validate.mockResolvedValueOnce(serviceCaller as never);
    svc.ask.mockResolvedValueOnce({ answer: 'ok', truncated: false, conversation_id: 'c', message_id: 'm' });
    const conversation = '00000000-0000-4000-8000-000000000001';
    const request = post({ question: 'hi', conversation_id: conversation, thread_title: 'Plans' });
    request.headers.set('Idempotency-Key', 'msg-1');
    const response = await askAgent(request, askCtx);
    expect(response.status).toBe(200);
    expect(svc.ask).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: conversation, threadTitle: 'Plans', idempotencyKey: 'msg-1',
    }));
    expect((await response.json()).data).toMatchObject({ conversation_id: 'c', message_id: 'm' });
  });

  it('rejects a non-UUID conversation_id and a malformed Idempotency-Key', async () => {
    validate.mockResolvedValueOnce(serviceCaller as never).mockResolvedValueOnce(serviceCaller as never);
    expect((await askAgent(post({ question: 'hi', conversation_id: 'nope' }), askCtx)).status).toBe(400);
    const request = post({ question: 'hi' });
    request.headers.set('Idempotency-Key', 'bad key!');
    expect((await askAgent(request, askCtx)).status).toBe(400);
    expect(svc.ask).not.toHaveBeenCalled();
  });

  it('runs async asks in the background and returns 202 (P4c)', async () => {
    validate.mockResolvedValueOnce(serviceCaller as never);
    const noKey = await askAgent(new Request('http://x/api/v1/federation/agents/Health/ask?async=1', {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'hi' }),
    }), askCtx);
    expect(noKey.status).toBe(400);

    validate.mockResolvedValueOnce(serviceCaller as never);
    svc.askAsync.mockResolvedValueOnce({ status: 'pending' });
    const request = new Request('http://x/api/v1/federation/agents/Health/ask?async=1', {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json', 'Idempotency-Key': 'k1' }, body: JSON.stringify({ question: 'hi' }),
    });
    const response = await askAgent(request, askCtx);
    expect(response.status).toBe(202);
    expect((await response.json()).data).toEqual({ status: 'pending', key: 'k1', poll_after_ms: 3000 });
    expect(svc.ask).not.toHaveBeenCalled();

    validate.mockResolvedValueOnce(serviceCaller as never);
    svc.askAsync.mockResolvedValueOnce({ status: 'done', result: { answer: 'a', truncated: false, conversation_id: null, message_id: null } });
    const done = await askAgent(new Request(request.url, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json', 'Idempotency-Key': 'k1' }, body: JSON.stringify({ question: 'hi' }),
    }), askCtx);
    expect(done.status).toBe(200);
    expect((await done.json()).data).toMatchObject({ status: 'done', answer: 'a' });
  });

  it('reads ask results by key for the same principal (P4c)', async () => {
    const ctx = (key: string) => ({ params: Promise.resolve({ key }) });
    const get = () => new Request('http://x/api/v1/federation/asks/k1', { headers: auth });
    validate.mockResolvedValueOnce(serviceCaller as never);
    svc.getAskResult.mockResolvedValueOnce({ status: 'pending' });
    const pending = await askResult(get(), ctx('k1'));
    expect(pending.status).toBe(202);
    expect(validate).toHaveBeenCalledWith('alr_live_service', 'federation:agents:ask');
    expect(svc.getAskResult).toHaveBeenCalledWith('principal-1', 'user-b', 'k1');

    validate.mockResolvedValueOnce(serviceCaller as never);
    svc.getAskResult.mockResolvedValueOnce({ status: 'done', response: { answer: 'a', truncated: false, conversation_id: 'c', message_id: null } });
    expect((await (await askResult(get(), ctx('k1'))).json()).data).toMatchObject({ status: 'done', answer: 'a', conversation_id: 'c' });

    validate.mockResolvedValueOnce(serviceCaller as never);
    svc.getAskResult.mockResolvedValueOnce({ status: 'failed', errorCode: 'timeout' });
    expect((await (await askResult(get(), ctx('k1'))).json()).data).toEqual({ status: 'failed', error_code: 'timeout' });

    validate.mockResolvedValueOnce(serviceCaller as never);
    svc.getAskResult.mockRejectedValueOnce(new FederationError('ask_not_found', 'Ask not found', 404));
    expect((await askResult(get(), ctx('k1'))).status).toBe(404);

    validate.mockResolvedValueOnce(serviceCaller as never);
    expect((await askResult(get(), ctx('bad key!'))).status).toBe(400);
  });

  it('rejects empty or oversized questions', async () => {
    validate.mockResolvedValue(serviceCaller as never);
    expect((await askAgent(post({ question: '' }), askCtx)).status).toBe(400);
    expect((await askAgent(post({ question: 'x'.repeat(4001) }), askCtx)).status).toBe(400);
    expect(svc.ask).not.toHaveBeenCalled();
    validate.mockReset();
  });

  it('returns 429 with retry headers when rate limited', async () => {
    validate.mockResolvedValueOnce(serviceCaller as never);
    svc.ask.mockRejectedValueOnce(new FederationRateLimitedError(30, { 'Retry-After': '30' }));
    const response = await askAgent(post({ question: 'hi' }), askCtx);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
  });

  it('peer audit is admin-only and validates the id', async () => {
    jest.mocked(requireCurrentUser).mockResolvedValue({ id: 'admin', email: 'a@x', name: 'A', is_admin: true } as never);
    const bad = await peerAudit(new Request('http://x'), { params: Promise.resolve({ id: 'nope' }) });
    expect(bad.status).toBe(404);
    const id = '6f1c2b1e-1111-4111-8111-111111111111';
    const ok = await peerAudit(new Request('http://x?limit=5'), { params: Promise.resolve({ id }) });
    expect(ok.status).toBe(200);
    expect(federationAuditRepository.listForPeer).toHaveBeenCalledWith(id, 5);

    jest.mocked(requireCurrentUser).mockResolvedValue({ id: 'u', email: 'u@x', name: 'U', is_admin: false } as never);
    expect((await peerAudit(new Request('http://x'), { params: Promise.resolve({ id }) })).status).toBe(403);
  });
});
