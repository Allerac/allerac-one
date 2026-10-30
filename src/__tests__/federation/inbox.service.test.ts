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

function setup(options: { now?: () => number } = {}) {
  const store = new InMemoryInboxStore();
  const peers = new InMemoryPeerStore();
  const federation = {
    listAgentsWithUnit: jest.fn().mockResolvedValue({
      agents: [{ id: 'chat', name: 'Chat', description: 'General' }],
      unit: { name: 'santos', displayName: 'Santos', emoji: '🏖️', role: 'Beach lab', description: null, tags: [] },
    }),
    askAgent: jest.fn().mockResolvedValue({ answer: 'hello from santos', truncated: false }),
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
    id: content, threadId: 't', role, content, status, truncated: false, errorCode: null, createdAt: new Date(),
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

  it('sends with context, stores the reply and audits with the thread id', async () => {
    const { service, peers, federation, store, log } = setup();
    await peers.insert(peerFixture());
    const thread = await service.openThread(user, peerFixture().id, 'Chat');
    const first = await service.send(user, thread.id, 'first question');
    expect(first.userMessage.status).toBe('done');
    expect(first.agentMessage?.content).toBe('hello from santos');
    expect(federation.askAgent).toHaveBeenLastCalledWith(peerFixture().id, 'chat', 'first question', { initiatedByUserId: 'admin-1', threadId: thread.id });

    await service.send(user, thread.id, 'second');
    const question = federation.askAgent.mock.calls[1][2] as string;
    expect(question).toContain('User: first question');
    expect(question).toContain('Agent: hello from santos');
    expect(question.endsWith('second')).toBe(true);
    expect(store.messages).toHaveLength(4);
    expect(log.mock.calls[0][0]).toMatch(/\[Inbox\] send thread=thread-\d+ peer=santos agent=chat status=done/);
    expect(log.mock.calls[0][0]).not.toContain('first question');
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

    federation.askAgent.mockRejectedValueOnce(new FederationError('peer_rate_limited', 'x', 502));
    const failed = await service.send(user, thread.id, 'hi');
    expect(failed.userMessage).toMatchObject({ status: 'failed', errorCode: 'peer_rate_limited' });
    expect(failed.agentMessage).toBeNull();

    federation.askAgent.mockImplementationOnce(async () => { clock += ASK_TIMEOUT_MS; throw federationErrors.peerUnreachable(); });
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
    federation.askAgent.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ answer: 'a', truncated: false }); }));
    const first = service.send(user, thread.id, 'one');
    await new Promise(resolve => setImmediate(resolve));
    await expect(service.send(user, thread.id, 'two')).rejects.toMatchObject({ code: 'send_in_progress' });
    release();
    await first;

    for (let i = 1; i < PEER_SENDS_PER_MINUTE; i += 1) await service.send(user, thread.id, `m${i}`);
    await expect(service.send(user, thread.id, 'over')).rejects.toMatchObject({ code: 'rate_limited', status: 429 });
  });

  it('keeps unpaired threads read-only and allows deleting their history', async () => {
    const { service, peers } = setup();
    await peers.insert(peerFixture());
    const thread = await service.openThread(user, peerFixture().id, 'chat');
    await service.send(user, thread.id, 'hi');
    await expect(service.deleteArchivedHistory(user, peerFixture().id)).rejects.toMatchObject({ code: 'invalid_state' });

    await peers.update(peerFixture().id, { status: 'revoked' });
    const listing = await service.list(user);
    expect(listing.units).toEqual([]);
    expect(listing.archived).toEqual([expect.objectContaining({ name: 'santos', threads: [expect.objectContaining({ threadId: thread.id })] })]);

    const view = await service.getThread(user, thread.id);
    expect(view.readOnly).toBe(true);
    expect(view.messages).toHaveLength(2);
    await expect(service.send(user, thread.id, 'again')).rejects.toMatchObject({ code: 'unit_not_paired' });

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
