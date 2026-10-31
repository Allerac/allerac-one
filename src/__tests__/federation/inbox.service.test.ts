/** @jest-environment node */
import { FederationError, federationErrors } from '@/federation/errors';
import { ASK_TIMEOUT_MS } from '@/federation/federation-client';
import {
  CONTEXT_TURNS, InboxError, InboxService, PEER_SENDS_PER_MINUTE, packQuestion, type InboxFederationPort,
} from '@/federation/inbox.service';
import type { FederatedMessage } from '@/federation/inbox.types';
import { InMemoryPeerStore } from '../__mocks__/federation-fakes';
import { InMemoryInboxStore, peerFixture } from '../__mocks__/inbox-fakes';

const user = { id: 'admin-1', is_admin: true };

const REMOTE_CONV = '00000000-0000-4000-8000-0000000000aa';

function setup(options: { now?: () => number; legacyPeer?: boolean } = {}) {
  const store = new InMemoryInboxStore();
  const peers = new InMemoryPeerStore();
  const federation = {
    listAgentsWithUnit: jest.fn().mockResolvedValue({
      agents: [{ id: 'chat', name: 'Chat', description: 'General' }],
      unit: { name: 'santos', displayName: 'Santos', emoji: '🏖️', role: 'Beach lab', description: null, tags: [] },
    }),
    askAgentInConversation: jest.fn().mockResolvedValue({
      answer: 'hello from santos', truncated: false,
      conversationId: options.legacyPeer ? null : REMOTE_CONV, messageId: options.legacyPeer ? null : 'remote-msg-1',
    }),
  } satisfies InboxFederationPort;
  const log = jest.fn();
  const service = new InboxService({
    store, peers, federation, log,
    localAgents: async () => [{ slug: 'chat', name: 'Chat' }],
    loadHomeUnit: async () => ({ name: 'napols', displayName: 'Napols', emoji: '🍕', role: 'Home', description: null, tags: [] }),
    now: options.now,
  });
  return { store, peers, federation, service, log };
}

describe('packQuestion', () => {
  const msg = (role: 'user' | 'agent', content: string, status: FederatedMessage['status'] = 'done'): FederatedMessage => ({
    id: content, threadId: 't', role, content, status, truncated: false, errorCode: null, remoteMessageId: null, createdAt: new Date(),
  });

  it('sends the plain message when there is no history', () => {
    expect(packQuestion([], 'hi')).toBe('hi');
  });

  it('packs the last turns, skipping failed ones', () => {
    const history = Array.from({ length: 10 }, (_, i) => msg(i % 2 ? 'agent' : 'user', `m${i}`));
    history.push(msg('user', 'broken', 'failed'));
    const packed = packQuestion(history, 'now?');
    expect(packed).toContain('User: m4');
    expect(packed).not.toContain('m3');
    expect(packed).not.toContain('broken');
    expect(packed.split('\n').filter(line => /^(User|Agent):/.test(line))).toHaveLength(CONTEXT_TURNS);
    expect(packed.endsWith('Current message:\nnow?')).toBe(true);
  });

  it('drops oldest context to fit the size cap', () => {
    const packed = packQuestion([msg('user', 'a'.repeat(900)), msg('agent', 'b'.repeat(900))], 'q', 1_000);
    expect(packed.length).toBeLessThanOrEqual(1_000);
    expect(packed).not.toContain('aaaa');
    expect(packed).toContain('bbbb');
  });
});

describe('InboxService', () => {
  it('lists home agents, peer agents grouped with identity, never secrets', async () => {
    const { service, peers } = setup();
    await peers.insert(peerFixture());
    const listing = await service.list(user);
    expect(listing.home).toMatchObject({ name: 'napols', emoji: '🍕', agents: [{ slug: 'chat', name: 'Chat' }] });
    expect(listing.units).toEqual([expect.objectContaining({
      name: 'santos', emoji: '🏖️', role: 'Beach lab', status: 'online',
      agents: [expect.objectContaining({ slug: 'chat', available: true, threadId: null })],
    })]);
    const json = JSON.stringify(listing);
    expect(json).not.toContain('secret-key');
    expect(json).not.toContain('alr_live');
    expect(json).not.toContain('santos.example');
  });

  it('marks a peer offline when listing fails and caches successful listings', async () => {
    const { service, peers, federation } = setup();
    await peers.insert(peerFixture());
    await service.list(user);
    await service.list(user);
    expect(federation.listAgentsWithUnit).toHaveBeenCalledTimes(1);

    const second = setup();
    await second.peers.insert(peerFixture());
    second.federation.listAgentsWithUnit.mockRejectedValueOnce(federationErrors.peerUnreachable());
    const listing = await second.service.list(user);
    expect(listing.units[0]).toMatchObject({ status: 'offline', agents: [] });
  });

  it('continues the remote conversation without packing context, and audits with the thread id', async () => {
    const { service, peers, federation, store, log } = setup();
    await peers.insert(peerFixture());
    const thread = await service.openThread(user, peerFixture().id, 'Chat');
    const first = await service.send(user, thread.id, 'first question');
    expect(first.userMessage.status).toBe('done');
    expect(first.agentMessage?.content).toBe('hello from santos');
    expect(federation.askAgentInConversation).toHaveBeenLastCalledWith(peerFixture().id, 'chat', {
      question: 'first question', conversationId: null, threadTitle: 'Chat @ Santos', idempotencyKey: `${first.userMessage.id}:new`,
    }, { initiatedByUserId: 'admin-1', threadId: thread.id });
    expect(store.threads.get(thread.id)?.remoteConversationId).toBe(REMOTE_CONV);
    expect(store.messages.find(m => m.role === 'agent')?.remoteMessageId).toBe('remote-msg-1');

    const second = await service.send(user, thread.id, 'second');
    expect(federation.askAgentInConversation.mock.calls[1][2]).toEqual({
      question: 'second', conversationId: REMOTE_CONV, threadTitle: 'Chat @ Santos', idempotencyKey: `${second.userMessage.id}:${REMOTE_CONV}`,
    });
    expect(store.messages).toHaveLength(4);
    expect(log.mock.calls[0][0]).toMatch(/\[Inbox\] send thread=thread-\d+ peer=santos agent=chat status=done/);
    expect(log.mock.calls[0][0]).not.toContain('first question');
  });

  it('packs context once for a P4a thread on its first P4b send (decision 1)', async () => {
    const { service, peers, federation, store } = setup();
    await peers.insert(peerFixture());
    const thread = await service.openThread(user, peerFixture().id, 'chat');
    await store.insertMessage({ threadId: thread.id, role: 'user', content: 'old question', status: 'done' });
    await store.insertMessage({ threadId: thread.id, role: 'agent', content: 'old answer', status: 'done' });
    await service.send(user, thread.id, 'new');
    const firstInput = federation.askAgentInConversation.mock.calls[0][2];
    expect(firstInput.conversationId).toBeNull();
    expect(firstInput.question).toContain('User: old question');
    expect(firstInput.question).toContain('Agent: old answer');
    await service.send(user, thread.id, 'next');
    expect(federation.askAgentInConversation.mock.calls[1][2].question).toBe('next');
  });

  it('keeps packing context with a pre-P4b peer (mixed versions)', async () => {
    const { service, peers, federation, store } = setup({ legacyPeer: true });
    await peers.insert(peerFixture());
    const thread = await service.openThread(user, peerFixture().id, 'chat');
    await service.send(user, thread.id, 'first question');
    await service.send(user, thread.id, 'second');
    const input = federation.askAgentInConversation.mock.calls[1][2];
    expect(input.conversationId).toBeNull();
    expect(input.question).toContain('User: first question');
    expect(store.threads.get(thread.id)?.remoteConversationId).toBeNull();
  });

  it('resets context once when the peer no longer knows the conversation', async () => {
    const { service, peers, federation, store } = setup();
    await peers.insert(peerFixture());
    const thread = await service.openThread(user, peerFixture().id, 'chat');
    await service.send(user, thread.id, 'first question');
    federation.askAgentInConversation
      .mockRejectedValueOnce(new FederationError('peer_conversation_not_found', 'gone', 502))
      .mockResolvedValueOnce({ answer: 'fresh', truncated: false, conversationId: '00000000-0000-4000-8000-0000000000bb', messageId: null });
    const result = await service.send(user, thread.id, 'still there?');
    expect(result.agentMessage?.content).toBe('fresh');
    expect(result.notices).toEqual([expect.objectContaining({ role: 'system', content: 'Context reset on Santos' })]);
    const retryInput = federation.askAgentInConversation.mock.calls[2][2];
    expect(retryInput.conversationId).toBeNull();
    expect(retryInput.idempotencyKey).toBe(`${result.userMessage.id}:new`);
    expect(retryInput.question).toContain('User: first question');
    expect(store.threads.get(thread.id)?.remoteConversationId).toBe('00000000-0000-4000-8000-0000000000bb');
  });

  it('retries with the same idempotency key', async () => {
    const { service, peers, federation } = setup();
    await peers.insert(peerFixture());
    const thread = await service.openThread(user, peerFixture().id, 'chat');
    federation.askAgentInConversation.mockRejectedValueOnce(federationErrors.peerUnreachable());
    const failed = await service.send(user, thread.id, 'hi');
    await service.retry(user, thread.id, failed.userMessage.id);
    expect(federation.askAgentInConversation.mock.calls.map(call => call[2].idempotencyKey))
      .toEqual([`${failed.userMessage.id}:new`, `${failed.userMessage.id}:new`]);
  });

  it('supports several threads per agent, rename and pagination', async () => {
    const { service, peers, store } = setup();
    await peers.insert(peerFixture());
    const main = await service.openThread(user, peerFixture().id, 'chat');
    expect((await service.openThread(user, peerFixture().id, 'chat')).id).toBe(main.id);
    const extra = await service.openThread(user, peerFixture().id, 'chat', { newThread: true, title: '  Trip   plans ' });
    expect(extra.id).not.toBe(main.id);
    expect(extra.title).toBe('Trip plans');

    const row = (await service.list(user)).units[0].agents[0];
    expect(row.threadId).toBe(main.id);
    expect(row.threads.map(thread => thread.threadId).sort()).toEqual([main.id, extra.id].sort());

    await expect(service.renameThread(user, extra.id, '')).rejects.toMatchObject({ code: 'validation_error' });
    expect(await service.renameThread(user, extra.id, 'Renamed')).toEqual({ id: extra.id, title: 'Renamed' });

    for (let i = 0; i < 60; i += 1) await store.insertMessage({ threadId: main.id, role: 'user', content: `m${i}`, status: 'done' });
    const view = await service.getThread(user, main.id);
    expect(view.messages).toHaveLength(50);
    expect(view.messages[0].content).toBe('m10');
    expect(view.nextCursor).toBe(view.messages[0].id);
    const older = await service.listMessages(user, main.id, null, 5);
    expect(older.messages.at(-1)?.content).toBe('m59');
    await expect(service.listMessages(user, main.id, 'not-a-uuid')).rejects.toMatchObject({ code: 'validation_error' });
  });

  it('rejects unknown agents and invalid slugs', async () => {
    const { service, peers } = setup();
    await peers.insert(peerFixture());
    await expect(service.openThread(user, peerFixture().id, 'nope')).rejects.toMatchObject({ code: 'not_found' });
    await expect(service.openThread(user, peerFixture().id, '../x')).rejects.toMatchObject({ code: 'validation_error' });
  });

  it('marks failures and timeouts, then retries', async () => {
    let clock = 0;
    const { service, peers, federation } = setup({ now: () => clock });
    await peers.insert(peerFixture());
    const thread = await service.openThread(user, peerFixture().id, 'chat');

    federation.askAgentInConversation.mockRejectedValueOnce(new FederationError('peer_rate_limited', 'x', 502));
    const failed = await service.send(user, thread.id, 'hi');
    expect(failed.userMessage).toMatchObject({ status: 'failed', errorCode: 'peer_rate_limited' });
    expect(failed.agentMessage).toBeNull();

    federation.askAgentInConversation.mockImplementationOnce(async () => { clock += ASK_TIMEOUT_MS; throw federationErrors.peerUnreachable(); });
    const timedOut = await service.retry(user, thread.id, failed.userMessage.id);
    expect(timedOut.userMessage).toMatchObject({ status: 'timeout', errorCode: 'timeout' });

    const ok = await service.retry(user, thread.id, failed.userMessage.id);
    expect(ok.userMessage.status).toBe('done');
    expect(ok.agentMessage?.content).toBe('hello from santos');
    await expect(service.retry(user, thread.id, failed.userMessage.id)).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('validates message size', async () => {
    const { service, peers } = setup();
    await peers.insert(peerFixture());
    const thread = await service.openThread(user, peerFixture().id, 'chat');
    await expect(service.send(user, thread.id, '   ')).rejects.toBeInstanceOf(InboxError);
    await expect(service.send(user, thread.id, 'x'.repeat(4_001))).rejects.toMatchObject({ status: 400 });
  });

  it('allows one send in flight per thread and rate limits per peer', async () => {
    const { service, peers, federation } = setup();
    await peers.insert(peerFixture());
    const thread = await service.openThread(user, peerFixture().id, 'chat');
    let release: () => void = () => undefined;
    federation.askAgentInConversation.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ answer: 'a', truncated: false, conversationId: null, messageId: null }); }));
    const first = service.send(user, thread.id, 'one');
    await new Promise(resolve => setImmediate(resolve));
    await expect(service.send(user, thread.id, 'two')).rejects.toMatchObject({ code: 'send_in_progress' });
    release();
    await first;

    for (let i = 1; i < PEER_SENDS_PER_MINUTE; i += 1) await service.send(user, thread.id, `m${i}`);
    await expect(service.send(user, thread.id, 'over')).rejects.toMatchObject({ code: 'rate_limited', status: 429 });
  });

  it('keeps unpaired threads read-only and allows deleting their history', async () => {
    const { service, peers, store } = setup();
    await peers.insert(peerFixture());
    const thread = await service.openThread(user, peerFixture().id, 'chat');
    await service.send(user, thread.id, 'hi');
    await expect(service.deleteArchivedHistory(user, peerFixture().id)).rejects.toMatchObject({ code: 'invalid_state' });
    await expect(service.deleteThread(user, thread.id)).rejects.toMatchObject({ code: 'invalid_state' });

    await peers.update(peerFixture().id, { status: 'revoked' });
    const listing = await service.list(user);
    expect(listing.units).toEqual([]);
    expect(listing.archived).toEqual([expect.objectContaining({ name: 'santos', threads: [expect.objectContaining({ threadId: thread.id })] })]);

    const view = await service.getThread(user, thread.id);
    expect(view.readOnly).toBe(true);
    expect(view.messages).toHaveLength(2);
    await expect(service.send(user, thread.id, 'again')).rejects.toMatchObject({ code: 'unit_not_paired' });
    await expect(service.renameThread(user, thread.id, 'x')).rejects.toMatchObject({ code: 'unit_not_paired' });

    const extra = await store.createThread({ userId: user.id, peerId: peerFixture().id, agentSlug: 'chat', title: 'x' });
    await service.deleteThread(user, extra.id);
    expect(store.threads.has(extra.id)).toBe(false);
    expect(await service.deleteArchivedHistory(user, peerFixture().id)).toBe(1);
    expect((await service.list(user)).archived).toEqual([]);
  });

  it('shows unread counts and clears them when the thread is read', async () => {
    const { service, peers, store } = setup();
    await peers.insert(peerFixture());
    const thread = await service.openThread(user, peerFixture().id, 'chat');
    await store.insertMessage({ threadId: thread.id, role: 'agent', content: 'ping', status: 'done' });
    expect((await service.list(user)).units[0].agents[0]).toMatchObject({ unread: 1, preview: 'ping', threadId: thread.id });
    await service.getThread(user, thread.id);
    expect((await service.list(user)).units[0].agents[0].unread).toBe(0);
  });

  it('does not expose other users threads', async () => {
    const { service, peers } = setup();
    await peers.insert(peerFixture());
    const thread = await service.openThread(user, peerFixture().id, 'chat');
    await expect(service.getThread({ id: 'other', is_admin: true }, thread.id)).rejects.toMatchObject({ status: 404 });
  });
});
