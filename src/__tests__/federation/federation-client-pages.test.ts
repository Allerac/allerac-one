/** @jest-environment node */
import { FederationClient } from '@/federation/federation-client';
import { InMemoryPeerStore, MemoryAudit, fakeSecrets } from '../__mocks__/federation-fakes';
import { peerFixture } from '../__mocks__/inbox-fakes';
import type { PeerClient } from '@/federation/peer-client';

function clientReturning(data: unknown) {
  const store = new InMemoryPeerStore();
  const transport = { callPeer: jest.fn().mockResolvedValue({ data, status: 200, requestBytes: 0, responseBytes: 0 }) } as unknown as PeerClient;
  const client = new FederationClient({ store, transport, secrets: fakeSecrets, audit: new MemoryAudit() });
  return { store, client };
}

describe('FederationClient agents list pages', () => {
  it('reads the peer page ids', async () => {
    const { store, client } = clientReturning({ agents: [], unit: null, pages: ['health', 'notes'] });
    const peer = peerFixture();
    await store.insert(peer);
    const result = await client.listAgentsWithUnit(peer.id, { initiatedByUserId: 'u' });
    expect(result.pages).toEqual(['health', 'notes']);
  });

  it('ignores a missing or malformed field (older or misbehaving peers)', async () => {
    for (const pages of [undefined, 'health', [42], ['../../etc']]) {
      const { store, client } = clientReturning({ agents: [], unit: null, ...(pages === undefined ? {} : { pages }) });
      const peer = peerFixture();
      await store.insert(peer);
      const result = await client.listAgentsWithUnit(peer.id, { initiatedByUserId: 'u' });
      expect(result.pages).toBeUndefined();
      expect(result.agents).toEqual([]);
    }
  });
});
