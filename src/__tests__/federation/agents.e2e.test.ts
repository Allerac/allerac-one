/** @jest-environment node */

import { createNetwork, fakeSecrets } from '../__mocks__/federation-fakes';
import { FederationError } from '@/federation/errors';

const NAPOLS = 'https://napols.example';
const UNIT2 = 'https://unit2.example';

async function pairedUnits(unit2Grants: string[], unit2Env: Record<string, string> = {}) {
  const network = createNetwork([
    { origin: NAPOLS, name: 'napols' },
    { origin: UNIT2, name: 'unit2', env: { ALLERAC_FEDERATION_AGENTS: 'health,sales,music', ...unit2Env } },
  ]);
  const a = network.units.get(NAPOLS)!;
  const b = network.units.get(UNIT2)!;
  await a.service.initiate({ url: UNIT2, grants: [], adminId: 'admin-a' });
  const [inbound] = await b.service.list();
  await b.service.accept({ peerId: inbound.id, grants: unit2Grants, adminId: 'admin-b' });
  const [peerOnA] = await a.service.list();
  return { a, b, peerOnA, peerOnB: inbound, network };
}

describe('federation agents between two Units (mocked network)', () => {
  it('lists and asks exposed agents, with audit on both sides', async () => {
    const { a, b, peerOnA } = await pairedUnits(['federation.agents.list', 'federation.agents.ask']);
    const ctx = { initiatedByUserId: 'admin-a' };

    const agents = await a.client.listAgents(peerOnA.id, ctx);
    // Public domains (sales) are never exposed.
    expect(agents.map(agent => agent.id)).toEqual(['health', 'music']);

    const result = await a.client.askAgent(peerOnA.id, 'health', 'How did I sleep?', ctx);
    expect(result).toEqual({ answer: 'answer from health: How did I sleep?', truncated: false });
    expect(b.runtime.chats).toHaveLength(1);
    expect(b.runtime.chats[0]).toMatchObject({ domain: 'health', conversationId: 'conv:health:Federation · napols' });

    expect(a.audit.entries.map(entry => [entry.direction, entry.capability, entry.outcome])).toEqual([
      ['outbound', 'federation.agents.list', 'ok'],
      ['outbound', 'federation.agents.ask', 'ok'],
    ]);
    expect(b.audit.entries.map(entry => [entry.direction, entry.capability, entry.outcome])).toEqual([
      ['inbound', 'federation.agents.list', 'ok'],
      ['inbound', 'federation.agents.ask', 'ok'],
    ]);
    // Audit never carries question or answer content.
    expect(JSON.stringify([a.audit.entries, b.audit.entries])).not.toContain('sleep');
  });

  it('refuses capabilities the peer did not grant, without calling it', async () => {
    const { a, b, peerOnA, network } = await pairedUnits(['federation.agents.list']);
    const before = network.calls.length;
    await expect(a.client.askAgent(peerOnA.id, 'health', 'hi', { initiatedByUserId: null }))
      .rejects.toMatchObject({ status: 403 });
    expect(network.calls.length).toBe(before);
    expect(b.runtime.chats).toHaveLength(0);
    expect(a.audit.entries.at(-1)).toMatchObject({ outcome: 'denied', errorCode: 'capability_not_granted' });
  });

  it('returns not found for agents that are not exposed', async () => {
    const { a, peerOnA } = await pairedUnits(['federation.agents.ask']);
    await expect(a.client.askAgent(peerOnA.id, 'sales', 'hi', { initiatedByUserId: null }))
      .rejects.toBeInstanceOf(FederationError);
    await expect(a.client.askAgent(peerOnA.id, 'email', 'hi', { initiatedByUserId: null }))
      .rejects.toMatchObject({ code: 'peer_error' });
  });

  it('exposes nothing by default', async () => {
    const { a, peerOnA } = await pairedUnits(['federation.agents.list'], { ALLERAC_FEDERATION_AGENTS: '' });
    expect(await a.client.listAgents(peerOnA.id, { initiatedByUserId: null })).toEqual([]);
  });

  it('stops working after the pairing is revoked', async () => {
    const { a, b, peerOnA, peerOnB } = await pairedUnits(['federation.agents.list']);
    const keyOnA = fakeSecrets.decrypt([...a.store.rows.values()][0].outboundKeyEncrypted!);
    await b.service.revoke({ peerId: peerOnB.id });
    expect(b.principals.resolve(keyOnA, 'federation:agents:list')).toBeNull();
    await expect(a.client.listAgents(peerOnA.id, { initiatedByUserId: null }))
      .rejects.toMatchObject({ status: 409 });
  });
});
