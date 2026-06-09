import '../__mocks__/db';
import pool from '@/app/clients/db';
import { requireCurrentAdmin, requireCurrentUser } from '@/app/lib/auth-session';
import { saveDefaultModel } from '@/app/actions/setup';
import { getDatabaseInfo, pullOllamaModel } from '@/app/actions/system';

jest.mock('@/app/lib/auth-session', () => ({
  requireCurrentAdmin: jest.fn(),
  requireCurrentUser: jest.fn(),
}));

const mockQuery = jest.mocked(pool.query);
const mockRequireCurrentAdmin = jest.mocked(requireCurrentAdmin);
const mockRequireCurrentUser = jest.mocked(requireCurrentUser);
const sessionUser = {
  id: 'user-a',
  email: 'a@example.com',
  name: 'User A',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

describe('Setup and system action authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue(sessionUser);
    mockRequireCurrentAdmin.mockResolvedValue({ ...sessionUser, is_admin: true });
  });

  it('saves the default model for the session user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await saveDefaultModel('qwen2.5:3b');

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_settings'),
      ['user-a', 'qwen2.5:3b']
    );
  });

  it('scopes database statistics to the session user', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ version: 'PostgreSQL 16.1' }] } as never)
      .mockResolvedValueOnce({ rows: [{ count: '1' }] } as never)
      .mockResolvedValueOnce({ rows: [{ count: '2' }] } as never)
      .mockResolvedValueOnce({ rows: [{ count: '3' }] } as never)
      .mockResolvedValueOnce({ rows: [{ count: '4' }] } as never);

    await getDatabaseInfo();

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('chat_conversations WHERE user_id = $1'),
      ['user-a']
    );
  });

  it('requires admin access before downloading a model', async () => {
    mockRequireCurrentAdmin.mockRejectedValueOnce(new Error('Admin access required'));

    const result = await pullOllamaModel('large-model');

    expect(result).toEqual({ success: false, message: 'Admin access required' });
    expect(mockRequireCurrentAdmin).toHaveBeenCalled();
  });
});
