import '../__mocks__/db';
import pool from '@/app/clients/db';
import { requireCurrentUser } from '@/app/lib/auth-session';
import { clearBenchmarkHistory } from '@/app/actions/benchmark';
import { getUserAccessibleDomains } from '@/app/actions/domains';

jest.mock('@/app/lib/auth-session', () => ({
  requireCurrentUser: jest.fn(),
}));

const mockQuery = jest.mocked(pool.query);
const mockRequireCurrentUser = jest.mocked(requireCurrentUser);

describe('Benchmark and domain action authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue({
      id: 'user-a',
      email: 'a@example.com',
      name: 'User A',
      is_admin: false,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  it('clears only the session user benchmark history', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await clearBenchmarkHistory();

    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM benchmark_results WHERE user_id = $1',
      ['user-a']
    );
  });

  it('does not trust a client-supplied admin flag', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ slug: 'chat' }], rowCount: 1 } as never);

    const result = await getUserAccessibleDomains();

    expect(result).toEqual(['chat']);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE uda.user_id = $1'),
      ['user-a']
    );
  });
});
