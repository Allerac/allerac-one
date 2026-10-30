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
    expect(mockQuery.mock.calls[0][0]).toContain('ON CONFLICT (user_id, peer_id, agent_slug)');
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
    expect(mockQuery.mock.calls[0][1]).toEqual(['t1', 'user', 'hi', 'pending', false, null]);
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await repo.updateMessage('m1', { status: 'failed', errorCode: 'peer_error' });
    expect(mockQuery.mock.calls[1][1]).toEqual(['m1', 'failed', 'peer_error']);
  });

  it('deletes history only for the given user and peer', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 3, rows: [] });
    expect(await repo.deleteThreadsForPeer('u1', 'p1')).toBe(3);
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1', 'p1']);
  });
});
