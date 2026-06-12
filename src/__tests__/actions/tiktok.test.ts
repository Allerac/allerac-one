import '../__mocks__/db';
import { requireCurrentUser } from '@/app/lib/auth-session';
import { getTikTokStatus } from '@/app/actions/tiktok';
import pool from '@/app/clients/db';

jest.mock('@/app/services/image-upload', () => ({
  getImageUploadService: jest.fn(),
}));
jest.mock('sharp', () => jest.fn());
jest.mock('@/app/lib/auth-session', () => ({
  requireCurrentUser: jest.fn(),
}));

const mockRequireCurrentUser = jest.mocked(requireCurrentUser);
const mockQuery = jest.mocked(pool.query);

describe('TikTok actions authorization', () => {
  it('uses the authenticated user when loading status', async () => {
    mockRequireCurrentUser.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      email: 'user@example.com',
      name: 'User',
      is_admin: false,
      created_at: new Date(),
    });
    mockQuery.mockResolvedValueOnce({ rows: [{}] } as never);

    await getTikTokStatus();

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('COALESCE(ta.owner_user_id, $1::uuid)'),
      ['00000000-0000-0000-0000-000000000001'],
    );
  });
});
