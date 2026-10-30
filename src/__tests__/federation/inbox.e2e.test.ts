/** @jest-environment node */
import { InboxService } from '@/federation/inbox.service';
import { createNetwork } from '../__mocks__/federation-fakes';
import { InMemoryInboxStore } from '../__mocks__/inbox-fakes';

const NAPOLS = 'https://napols.example';
const SANTOS = 'https://santos.example';

describe('unified inbox between two Units (mocked network)', () => {
  it('pair → list → chat → unpair → read-only', async () => {
    const network = createNetwork([
      { origin: NAPOLS, name: 'napols' },
      { origin: SANTOS, name: 'santos', env: { ALLERAC_FEDERATION_AGENTS: 'chat,sales' } },
    ]);
    const a = network.units.get(NAPOLS)!;
    const b = network.units.get(SANTOS)!;
    await a.service.initiate({ url: SANTOS, grants: [], adminId: 'admin-a' });
    const [inbound] = await b.service.list();
    await b.service.accept({ peerId: inbound.id, grants: ['federation.agents.list', 'federation.agents.ask'], adminId: 'admin-b' });
    const [peerOnA] = await a.service.list();

    const store = new InMemoryInboxStore();
    const inbox = new InboxService({
      store, peers: a.store, federation: a.client, log: () => undefined,
      localAgents: async () => [{ slug: 'chat', name: 'Chat' }],
      loadHomeUnit: async () => ({ name: 'napols', displayName: 'Napols', emoji: null, role: null, description: null, tags: [] }),
    });
    const user = { id: 'admin-a', is_admin: true };

    const listing = await inbox.list(user);
    expect(listing.units[0].agents.map(agent => agent.slug)).toEqual(['chat']);

    const thread = await inbox.openThread(user, peerOnA.id, 'chat');
    const reply = await inbox.send(user, thread.id, 'hello santos');
    expect(reply.agentMessage?.content).toBe('answer from chat: hello santos');
    const askAudit = a.audit.entries.find(entry => entry.capability === 'federation.agents.ask');
    expect(askAudit).toMatchObject({ outcome: 'ok', threadId: thread.id });

    await a.store.update(peerOnA.id, { status: 'revoked' });
    const view = await inbox.getThread(user, thread.id);
    expect(view.readOnly).toBe(true);
    await expect(inbox.send(user, thread.id, 'still there?')).rejects.toMatchObject({ code: 'unit_not_paired' });
  });
});
