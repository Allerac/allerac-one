/**
 * @jest-environment node
 *
 * Runs the inbox SQL against a real, migrated Postgres. Mocked pools cannot catch
 * query errors such as a parameter used with two different types. Enabled with
 * RUN_PG_TESTS=1 and DATABASE_URL (the "DB Integration" CI job).
 */
import { randomUUID } from 'crypto';
import pool from '@/app/clients/db';
import { InboxRepository } from '@/federation/inbox.repository';
import { InboxService, type InboxFederationPort } from '@/federation/inbox.service';
import { peerRepository } from '@/federation/peer.repository';
import type { FederatedMessage } from '@/federation/inbox.types';

const enabled = process.env.RUN_PG_TESTS === '1' && !!process.env.DATABASE_URL;
const describePg = enabled ? describe : describe.skip;

describePg('InboxRepository against Postgres', () => {
  const repo = new InboxRepository();
  let userId: string;
  let peerId: string;

  beforeAll(async () => {
    userId = (await pool.query(`INSERT INTO users (email, name) VALUES ($1, 'Inbox PG') RETURNING id`, [`inbox-pg-${randomUUID()}@example.com`])).rows[0].id;
    peerId = (await pool.query(
      `INSERT INTO federation_peers (unit_name, origin, initiated_by_us, status, outbound_capabilities)
       VALUES ($1, $2, true, 'active', ARRAY['federation.agents.ask', 'federation.agents.list']) RETURNING id`,
      [`pg${Date.now()}`, `https://pg-${randomUUID()}.example`],
    )).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM federated_threads WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM federation_peers WHERE id = $1', [peerId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });

  const newThread = () => repo.createThread({ userId, peerId, agentSlug: 'chat', title: 'PG thread' });
  const row = async (id: string) => (await pool.query('SELECT status, error_code, next_poll_at FROM federated_messages WHERE id = $1', [id])).rows[0];

  it.each(['pending', 'done', 'failed', 'timeout'] as const)('updateMessage sets status %s', async status => {
    const thread = await newThread();
    const message = await repo.insertMessage({ threadId: thread.id, role: 'user', content: 'q', status: 'pending' });
    const nextPollAt = new Date(Date.now() + 60_000);
    await repo.schedulePoll(message.id, { remoteRunId: `${message.id}:new`, nextPollAt, pollAttempts: 0, pendingDeadlineAt: null });
    await repo.updateMessage(message.id, { status, errorCode: status === 'done' || status === 'pending' ? null : status });
    const stored = await row(message.id);
    expect(stored.status).toBe(status);
    // Leaving `pending` stops polling.
    if (status === 'pending') expect(new Date(stored.next_poll_at).getTime()).toBe(nextPollAt.getTime());
    else expect(stored.next_poll_at).toBeNull();
  });

  it('sends async, polls the late reply end to end and marks it unread', async () => {
    const answer = { answer: 'late answer', truncated: false, conversationId: randomUUID(), messageId: 'remote-1' };
    let clock = Date.now();
    const federation = {
      listAgentsWithUnit: jest.fn().mockResolvedValue({ agents: [{ id: 'chat', name: 'Chat' }], unit: null, askVersion: 2 }),
      askAgentInConversation: jest.fn(),
      askAgentAsync: jest.fn().mockResolvedValue({ status: 'pending', pollAfterMs: 1_000 }),
      getAskResult: jest.fn().mockResolvedValueOnce({ status: 'pending', pollAfterMs: 1_000 }).mockResolvedValue({ status: 'done', result: answer }),
    } satisfies InboxFederationPort;
    const log = jest.fn();
    const service = new InboxService({
      store: repo, peers: peerRepository, federation, log, now: () => clock, random: () => 0.5,
      loadHomeUnit: async () => ({ name: 'home', displayName: 'Home', emoji: null, role: null, description: null, tags: [] }),
    });
    const user = { id: userId, is_admin: true };
    const thread = await service.openThread(user, peerId, 'chat', { newThread: true });
    const sent = await service.send(user, thread.id, 'slow question');
    expect(sent.userMessage.status).toBe('pending');

    clock += 1_000;
    expect(await service.pollDue(user, 10, thread.id)).toBe(0);
    let messages: FederatedMessage[] = await repo.listMessages(thread.id, 10);
    expect(messages[0]).toMatchObject({ status: 'pending', pollAttempts: 1 });

    clock += 60_000;
    expect(await service.pollDue(user, 10, thread.id)).toBe(1);
    messages = await repo.listMessages(thread.id, 10);
    expect(messages.map(m => [m.role, m.status])).toEqual([['user', 'done'], ['agent', 'done']]);
    expect(messages[1]).toMatchObject({ content: 'late answer', remoteMessageId: 'remote-1' });
    expect((await repo.getThreadById(thread.id))?.remoteConversationId).toBe(answer.conversationId);
    expect(federation.getAskResult).toHaveBeenLastCalledWith(peerId, `${sent.userMessage.id}:new`, expect.anything());
    const updates = await service.updates(user);
    expect(updates.threads.find(t => t.threadId === thread.id)).toMatchObject({ unread: 1, pending: false });
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('status=error'));
  });
});
