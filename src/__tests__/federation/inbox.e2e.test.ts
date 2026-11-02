/** @jest-environment node */
import { InboxService } from '@/federation/inbox.service';
import { createNetwork } from '../__mocks__/federation-fakes';
import { InMemoryInboxStore } from '../__mocks__/inbox-fakes';

const NAPOLS = 'https://napols.example';
const SANTOS = 'https://santos.example';

describe('unified inbox between two Units (mocked network)', () => {
  it('pair → list → chat → unpair → read-only (sync peer, pre-P4c)', async () => {
    const network = createNetwork([
      { origin: NAPOLS, name: 'napols' },
      { origin: SANTOS, name: 'santos', env: { ALLERAC_FEDERATION_AGENTS: 'chat,sales', FAKE_LEGACY_ASK: 'true' } },
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

    // P4b continuity: the second turn continues the same peer conversation with only the new text.
    await inbox.send(user, thread.id, 'and again');
    const [firstChat, secondChat] = b.runtime.chats;
    expect(secondChat.conversationId).toBe(firstChat.conversationId);
    expect(secondChat.message).toBe('and again');
    expect([...b.runtime.conversations.values()][0]).toMatchObject({ title: 'Federation · napols · Chat @ santos', slug: 'chat' });

    // Phase 5 with a pre-v3 peer: "New topic" starts a fresh peer conversation (null handle),
    // and the packed context does not cross the divider.
    await inbox.newTopic(user, thread.id);
    await inbox.send(user, thread.id, 'side');
    expect(b.lastAskBody).toMatchObject({ question: 'side', conversation_id: null });
    expect(b.lastAskBody).not.toHaveProperty('primary');
    expect(b.lastAskBody).not.toHaveProperty('topic_reset');
    expect(b.runtime.chats[2].conversationId).not.toBe(firstChat.conversationId);
    expect(b.runtime.topicResets).toHaveLength(0);

    // A retry with the same Idempotency-Key replays the stored reply without running the agent again.
    const input = { question: 'dup', conversationId: null, idempotencyKey: 'key-1' };
    const once = await a.client.askAgentInConversation(peerOnA.id, 'chat', input, { initiatedByUserId: 'admin-a' });
    const twice = await a.client.askAgentInConversation(peerOnA.id, 'chat', input, { initiatedByUserId: 'admin-a' });
    expect(twice).toEqual(once);
    expect(b.runtime.chats).toHaveLength(4);

    // Another conversation id (not owned) is refused and the thread resets its context once.
    await expect(a.client.askAgentInConversation(peerOnA.id, 'chat', {
      question: 'x', conversationId: '00000000-0000-4000-8000-00000000dead',
    }, { initiatedByUserId: 'admin-a' })).rejects.toMatchObject({ code: 'peer_conversation_not_found' });

    await a.store.update(peerOnA.id, { status: 'revoked' });
    const view = await inbox.getThread(user, thread.id);
    expect(view.readOnly).toBe(true);
    await expect(inbox.send(user, thread.id, 'still there?')).rejects.toMatchObject({ code: 'unit_not_paired' });
  });

  it('async peer: pending → background reply → polled → unread → read (P4c)', async () => {
    const network = createNetwork([
      { origin: NAPOLS, name: 'napols' },
      { origin: SANTOS, name: 'santos', env: { ALLERAC_FEDERATION_AGENTS: 'chat' } },
    ]);
    const a = network.units.get(NAPOLS)!;
    const b = network.units.get(SANTOS)!;
    await a.service.initiate({ url: SANTOS, grants: [], adminId: 'admin-a' });
    const [inbound] = await b.service.list();
    await b.service.accept({ peerId: inbound.id, grants: ['federation.agents.list', 'federation.agents.ask'], adminId: 'admin-b' });
    const [peerOnA] = await a.service.list();

    let release: () => void = () => undefined;
    b.runtime.runChat = async input => {
      await new Promise<void>(resolve => { release = resolve; });
      return { content: `late answer: ${input.message}` };
    };
    let clock = 1_000_000;
    const store = new InMemoryInboxStore();
    const inbox = new InboxService({
      store, peers: a.store, federation: a.client, log: () => undefined, now: () => clock, random: () => 0.5,
      localAgents: async () => [],
      loadHomeUnit: async () => ({ name: 'napols', displayName: 'Napols', emoji: null, role: null, description: null, tags: [] }),
    });
    const user = { id: 'admin-a', is_admin: true };
    const thread = await inbox.openThread(user, peerOnA.id, 'chat');

    const sent = await inbox.send(user, thread.id, 'slow question');
    expect(sent.userMessage.status).toBe('pending');
    expect(sent.agentMessage).toBeNull();
    expect((await inbox.updates(user)).threads[0]).toMatchObject({ pending: true, unread: 0 });
    await expect(inbox.send(user, thread.id, 'another')).rejects.toMatchObject({ code: 'send_in_progress' });

    clock += 3_000;
    expect(await inbox.pollDue(null, 50)).toBe(0); // still running on the peer

    release();
    await Promise.all(b.background);
    clock += 10_000;
    expect(await inbox.pollDue(null, 50)).toBe(1);
    const updates = await inbox.updates(user);
    expect(updates).toMatchObject({ totalUnread: 1, threads: [expect.objectContaining({ pending: false, unread: 1 })] });

    const view = await inbox.getThread(user, thread.id);
    expect(view.messages.map(m => m.content)).toEqual(['slow question', 'late answer: slow question']);
    expect((await inbox.updates(user)).totalUnread).toBe(0);
    expect(store.threads.get(thread.id)?.remoteConversationId).toBeTruthy();
  });

  async function pairedV3(env: Record<string, string> = {}) {
    const network = createNetwork([
      { origin: NAPOLS, name: 'napols' },
      { origin: SANTOS, name: 'santos', env: { ALLERAC_FEDERATION_AGENTS: 'chat', ...env } },
    ]);
    const a = network.units.get(NAPOLS)!;
    const b = network.units.get(SANTOS)!;
    await a.service.initiate({ url: SANTOS, grants: [], adminId: 'admin-a' });
    const [inbound] = await b.service.list();
    await b.service.accept({ peerId: inbound.id, grants: ['federation.agents.list', 'federation.agents.ask'], adminId: 'admin-b' });
    const [peerOnA] = await a.service.list();
    const store = new InMemoryInboxStore();
    let clock = 1_000_000;
    const inbox = new InboxService({
      store, peers: a.store, federation: a.client, log: () => undefined, now: () => clock, random: () => 0.5,
      localAgents: async () => [],
      loadHomeUnit: async () => ({ name: 'napols', displayName: 'Napols', emoji: null, role: null, description: null, tags: [] }),
    });
    const user = { id: 'admin-a', is_admin: true };
    const thread = await inbox.openThread(user, peerOnA.id, 'chat');
    // Lets the background ask finish and polls its reply.
    const settle = async () => { await Promise.all(b.background); clock += 60_000; await inbox.pollDue(null, 50); };
    return { a, b, store, inbox, user, thread, settle };
  }

  it('v3 peer: asks go to the primary conversation and "New topic" sends topic_reset once (phase 5)', async () => {
    const { b, store, inbox, user, thread, settle } = await pairedV3();
    await inbox.send(user, thread.id, 'hello');
    await settle();
    expect(b.lastAskBody).toMatchObject({ primary: true });
    expect(b.lastAskBody).not.toHaveProperty('conversation_id');
    expect(b.lastAskBody).not.toHaveProperty('topic_reset');

    const { divider } = await inbox.newTopic(user, thread.id);
    expect(divider).toMatchObject({ role: 'system', content: 'New topic' });
    expect(store.threads.get(thread.id)?.topicResetPending).toBe(true);
    await inbox.send(user, thread.id, 'fresh start');
    await settle();
    expect(b.lastAskBody).toMatchObject({ primary: true, topic_reset: true, question: 'fresh start' });
    // Same primary conversation on the peer, with a topic marker before the new turn.
    expect(b.runtime.chats).toHaveLength(2);
    expect(b.runtime.chats[1].conversationId).toBe(b.runtime.chats[0].conversationId);
    expect(b.runtime.topicResets).toEqual([{ conversationId: b.runtime.chats[0].conversationId, userId: expect.any(String) }]);
    expect(store.threads.get(thread.id)?.topicResetPending).toBe(false);
    expect(store.threads.get(thread.id)?.remoteConversationId).toBe(b.runtime.chats[0].conversationId);

    // Only once: the next ask has no topic_reset.
    await inbox.send(user, thread.id, 'more');
    await settle();
    expect(b.lastAskBody).not.toHaveProperty('topic_reset');
    expect(b.runtime.topicResets).toHaveLength(1);
  });

  it('v2 peer (mixed versions): the home keeps sending conversation_id, never primary/topic_reset', async () => {
    const { b, inbox, user, thread, settle } = await pairedV3({ FAKE_ASK_VERSION: '2' });
    await inbox.send(user, thread.id, 'hello');
    await settle();
    expect(b.lastAskBody).toMatchObject({ conversation_id: null });
    expect(b.lastAskBody).not.toHaveProperty('primary');
    await inbox.send(user, thread.id, 'again');
    await settle();
    expect(b.lastAskBody).toMatchObject({ conversation_id: b.runtime.chats[0].conversationId });
    await inbox.newTopic(user, thread.id);
    await inbox.send(user, thread.id, 'next');
    await settle();
    // Old peers: "New topic" = a fresh conversation (null handle).
    expect(b.lastAskBody).toMatchObject({ conversation_id: null, question: 'next' });
    expect(b.lastAskBody).not.toHaveProperty('topic_reset');
    expect(b.runtime.topicResets).toHaveLength(0);
  });
});
