jest.mock('@/app/clients/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

jest.mock('@/app/lib/auth-session', () => ({
  assertDomainAccess: jest.fn(),
}));

import pool from '@/app/clients/db';
import { assertDomainAccess } from '@/app/lib/auth-session';
import { buildMemoryTools } from '@/app/tools/memory.tool';
import type { User } from '@/app/services/auth/auth.service';

const query = jest.mocked(pool.query);
const assertAccess = jest.mocked(assertDomainAccess);
const user: User = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'User',
  is_admin: false,
  created_at: new Date(),
};

describe('memory tools', () => {
  beforeEach(() => {
    query.mockReset();
    assertAccess.mockReset();
  });

  test('recall_memory defaults to the caller domain and checks access', async () => {
    (query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'memory-1', summary: 'Prefers concise answers' }] });
    const tools = buildMemoryTools({ user, conversationId: 'conversation-1', callerDomain: 'write' });

    const result = await tools.recall_memory({ query: 'answers' });

    expect(assertAccess).toHaveBeenCalledWith(user, 'write');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('domain_slug = $2'), [
      'user-1',
      'write',
      '%answers%',
      5,
    ]);
    expect(result.memories).toHaveLength(1);
  });

  test('delete_memory is scoped to the current user', async () => {
    (query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'memory-1' }], rowCount: 1 });
    const tools = buildMemoryTools({ user, conversationId: 'conversation-1', callerDomain: 'memory' });

    const result = await tools.delete_memory({ memory_id: 'memory-1' });

    expect(query).toHaveBeenCalledWith(expect.stringContaining('user_id = $2'), ['memory-1', 'user-1']);
    expect(result).toEqual({ success: true, memory_id: 'memory-1' });
  });
});
