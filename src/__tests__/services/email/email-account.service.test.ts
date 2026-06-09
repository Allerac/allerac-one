import '../../__mocks__/db';
import pool from '@/app/clients/db';
import {
  EmailAccountNotFoundError,
  loadEmailAccountForUser,
} from '@/app/services/email/email-account.service';

const mockQuery = jest.mocked(pool.query);

describe('Email account ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads an account only when both account and user match', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await expect(loadEmailAccountForUser('account-b', 'user-a')).rejects.toBeInstanceOf(
      EmailAccountNotFoundError
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1 AND user_id = $2'),
      ['account-b', 'user-a']
    );
  });
});
