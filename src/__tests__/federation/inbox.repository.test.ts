/** @jest-environment node */
import '../__mocks__/db';
import pool from '@/app/clients/db';
import { InboxRepository } from '@/federation/inbox.repository';

const mockQuery = pool.query as unknown as jest.Mock;

const threadRow = {
  id: 't1', user_id: 'u1', peer_id: 'p1', agent_slug: 'chat', title: 'Chat @ Santos',
  last_message_at: null, last_read_at: null, archived_at: null, created_at: new Date(0),
};

describe('InboxRepository', () => {
  const repo = new InboxRepository();
  beforeEach(() => mockQuery.mockReset());

  it('lists threads scoped to the user with preview and unread', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...threadRow, preview: 'hi', unread: '2' }] });
    const rows = await repo.listThreads('u1');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('FROM federated_threads t');
    expect(sql).toContain("m.role = 'agent'");
    expect(params).toEqual(['u1']);
    expect(rows[0]).toMatchObject({ id: 't1', agentSlug: 'chat', preview: 'hi', unread: 2 });
  });

  it('scopes thread reads to the owner', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await repo.getThread('u1', 't1')).toBeNull();
    expect(mockQuery.mock.calls[0][1]).toEqual(['t1', 'u1']);
  });

  it('upserts the default thread per user, peer and agent', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [threadRow] });
    await repo.findOrCreateThread({ userId: 'u1', peerId: 'p1', agentSlug: 'chat', title: 'x' });
    expect(mockQuery.mock.calls[0][0]).toContain('ON CONFLICT (user_id, peer_id, agent_slug) WHERE is_default');
  });

  it('creates non-default threads and maps continuity fields (P4b)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...threadRow, is_default: false, remote_conversation_id: 'rc1' }] });
    const thread = await repo.createThread({ userId: 'u1', peerId: 'p1', agentSlug: 'chat', title: 'Trip' });
    expect(mockQuery.mock.calls[0][0]).toContain('false');
    expect(thread).toMatchObject({ isDefault: false, remoteConversationId: 'rc1' });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await repo.setRemoteConversationId('t1', null);
    expect(mockQuery.mock.calls[1][1]).toEqual(['t1', null]);
  });

  it('paginates with a keyset cursor scoped to the thread', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await repo.listMessagesBefore('t1', 'm9', 1_000);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('(m.created_at, m.id) <');
    expect(sql).toContain('c.thread_id = $1');
    expect(params).toEqual(['t1', 'm9', 200]);
  });

  it('deletes a single thread only for its owner', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    expect(await repo.deleteThread('u1', 't1')).toBe(true);
    expect(mockQuery.mock.calls[0][1]).toEqual(['t1', 'u1']);
  });

  it('caps message pages and returns them oldest first', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await repo.listMessages('t1', 10_000);
    expect(mockQuery.mock.calls[0][0]).toContain('ORDER BY created_at ASC');
    expect(mockQuery.mock.calls[0][1]).toEqual(['t1', 500]);
  });

  it('inserts and updates messages with parameters', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'm1', thread_id: 't1', role: 'user', content: 'hi', status: 'pending', truncated: false, error_code: null, created_at: new Date() }] });
    const message = await repo.insertMessage({ threadId: 't1', role: 'user', content: 'hi', status: 'pending' });
    expect(message).toMatchObject({ id: 'm1', status: 'pending' });
    expect(mockQuery.mock.calls[0][1]).toEqual(['t1', 'user', 'hi', 'pending', false, null, null]);
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await repo.updateMessage('m1', { status: 'failed', errorCode: 'peer_error' });
    expect(mockQuery.mock.calls[1][1]).toEqual(['m1', 'failed', 'peer_error', false]);
  });

  it('deletes history only for the given user and peer', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 3, rows: [] });
    expect(await repo.deleteThreadsForPeer('u1', 'p1')).toBe(3);
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1', 'p1']);
  });

  it('schedules, claims and lists due async polls (P4c)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const next = new Date(5_000);
    await repo.schedulePoll('m1', { remoteRunId: 'k', nextPollAt: next, pollAttempts: 2, pendingDeadlineAt: null });
    expect(mockQuery.mock.calls[0][0]).toContain("status = 'pending'");
    expect(mockQuery.mock.calls[0][1]).toEqual(['m1', 'k', next, 2, null]);

    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    expect(await repo.claimPoll('m1', next, new Date(9_000))).toBe(false);
    expect(mockQuery.mock.calls[1][0]).toContain('IS NOT DISTINCT FROM $2');

    mockQuery.mockResolvedValueOnce({ rows: [{
      id: 'm1', thread_id: 't1', role: 'user', content: 'q', status: 'pending', truncated: false, error_code: null,
      remote_run_id: 'k', next_poll_at: next, poll_attempts: 2, pending_deadline_at: null, created_at: new Date(0),
      thread: { ...threadRow, created_at: '1970-01-01T00:00:00.000Z' },
    }] });
    const due = await repo.listDuePending({ userId: 'u1', threadId: null, now: new Date(6_000), limit: 999 });
    expect(mockQuery.mock.calls[2][1]).toEqual([new Date(6_000), 'u1', null, 200]);
    expect(due[0].message).toMatchObject({ remoteRunId: 'k', pollAttempts: 2 });
    expect(due[0].thread).toMatchObject({ id: 't1', userId: 'u1' });
    expect(due[0].thread.createdAt).toBeInstanceOf(Date);
  });
});
