/** @jest-environment node */

import { AgentsService, FederationRateLimitedError, MAX_ANSWER_CHARS } from '@/federation/agents.service';
import { InMemoryPeerStore, MemoryAudit, fakeAgentsRuntime } from '../__mocks__/federation-fakes';

const allow = () => ({ allowed: true as const, lease: { release: jest.fn() }, headers: {} });

async function setup(options: {
  env?: Record<string, string>;
  runtime?: Parameters<typeof fakeAgentsRuntime>[0];
  acquire?: ConstructorParameters<typeof AgentsService>[0]['acquire'];
} = {}) {
  const store = new InMemoryPeerStore();
  const peer = await store.insert({
    origin: 'https://napols.example', unitName: 'napols', displayName: null, direction: 'inbound',
    status: 'active', inboundPrincipalId: 'principal-1', inboundCapabilities: ['federation.agents.ask'],
  } as never);
  const audit = new MemoryAudit();
  const runtime = fakeAgentsRuntime(options.runtime);
  const service = new AgentsService({
    runtime, store, audit, acquire: options.acquire ?? allow,
    env: { ALLERAC_FEDERATION_AGENTS: 'Health,openworld,music', ...options.env },
  });
  return { service, audit, runtime, peer };
}

describe('AgentsService', () => {
  it('rejects callers that are not an active peer', async () => {
    const { service } = await setup();
    await expect(service.listAgents('principal-unknown', 'user-1')).rejects.toMatchObject({ status: 403 });
  });

  it('lists only exposed, non-public, accessible domains', async () => {
    const { service } = await setup({ runtime: { canAccessDomain: async (_user, slug) => slug !== 'music' } });
    expect(await service.listAgents('principal-1', 'user-1')).toEqual([
      { id: 'health', name: 'Health', description: null },
    ]);
  });

  it('honours disabled modules', async () => {
    const { service } = await setup({ env: { ALLERAC_MODULES: 'health' } });
    const ids = (await service.listAgents('principal-1', 'user-1')).map(agent => agent.id);
    expect(ids).toEqual(['health']);
  });

  it('answers as the acting user and truncates long answers', async () => {
    const { service, runtime, audit } = await setup({
      runtime: { runChat: async () => ({ content: 'x'.repeat(MAX_ANSWER_CHARS + 10) }) },
    });
    const result = await service.ask({ principalId: 'principal-1', actingUserId: 'user-1', agent: 'health', question: 'q' });
    expect(result.truncated).toBe(true);
    expect(result.answer).toHaveLength(MAX_ANSWER_CHARS);
    expect(runtime.chats).toHaveLength(0);
    expect(audit.entries.at(-1)).toMatchObject({ direction: 'inbound', outcome: 'ok', target: 'health' });
  });

  it('returns not found for public or unexposed agents', async () => {
    const { service, runtime, audit } = await setup();
    for (const agent of ['openworld', 'email']) {
      await expect(service.ask({ principalId: 'principal-1', actingUserId: 'user-1', agent, question: 'q' }))
        .rejects.toMatchObject({ status: 404 });
    }
    expect(runtime.chats).toHaveLength(0);
    expect(audit.entries.every(entry => entry.outcome === 'denied')).toBe(true);
  });

  it('applies the federation-ask rate limit per principal', async () => {
    const acquire = jest.fn((operation: string) => operation === 'federation-ask'
      ? { allowed: false as const, retryAfterSeconds: 30, headers: { 'Retry-After': '30' } }
      : allow());
    const { service, runtime } = await setup({ acquire: acquire as never });
    await expect(service.ask({ principalId: 'principal-1', actingUserId: 'user-1', agent: 'health', question: 'q' }))
      .rejects.toBeInstanceOf(FederationRateLimitedError);
    expect(acquire).toHaveBeenCalledWith('federation-ask', 'principal:principal-1');
    expect(runtime.chats).toHaveLength(0);
  });

  it('releases leases and audits errors when no model is configured', async () => {
    const lease = { release: jest.fn() };
    const { service, audit } = await setup({
      acquire: () => ({ allowed: true, lease, headers: {} }),
      runtime: { resolveModel: async () => null },
    });
    await expect(service.ask({ principalId: 'principal-1', actingUserId: 'user-1', agent: 'health', question: 'q' }))
      .rejects.toMatchObject({ status: 422 });
    expect(lease.release).toHaveBeenCalledTimes(2);
    expect(audit.entries.at(-1)).toMatchObject({ outcome: 'error', errorCode: 'provider_not_configured' });
  });
});
