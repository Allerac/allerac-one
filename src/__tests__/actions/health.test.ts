import '../__mocks__/db';
import pool from '@/app/clients/db';
import { requireCurrentUser } from '@/app/lib/auth-session';
import { getGarminStatus } from '@/app/actions/health';

jest.mock('@/app/lib/auth-session', () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock('@/lib/submit-log', () => ({
  submitLog: jest.fn(),
}));

const mockQuery = jest.mocked(pool.query);
const mockRequireCurrentUser = jest.mocked(requireCurrentUser);

describe('Health actions authorization', () => {
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

  it('ignores a client-supplied user id and uses the session user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await getGarminStatus();

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_id = $1'),
      ['user-a']
    );
  });
});
