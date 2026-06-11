/** @jest-environment node */

import '../../__mocks__/db';
import pool from '@/app/clients/db';
import { encrypt } from '@/app/services/crypto/encryption.service';
import { TikTokCredentialsService } from '@/app/services/tiktok/tiktok-credentials.service';
import { TikTokApiService } from '@/app/services/tiktok/tiktok-api.service';

const mockQuery = jest.mocked(pool.query);
const mockConnect = jest.mocked(pool.connect);

describe('TikTokCredentialsService', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'test-encryption-key';
    jest.clearAllMocks();
  });

  it('resolves an assigned account owner before reading credentials', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ owner_user_id: 'owner-a' }] } as never)
      .mockResolvedValueOnce({
        rows: [{
          user_id: 'owner-a',
          access_token_encrypted: encrypt('valid-access'),
          refresh_token_encrypted: encrypt('refresh'),
          access_expires_at: new Date(Date.now() + 60 * 60 * 1000),
          refresh_expires_at: new Date(Date.now() + 60 * 60 * 1000),
          is_connected: true,
        }],
      } as never);

    const token = await new TikTokCredentialsService().getValidAccessToken('domain-user');

    expect(token).toBe('valid-access');
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM tiktok_credentials'),
      ['owner-a'],
    );
  });

  it('stores rotated access and refresh tokens while holding a row lock', async () => {
    const api = {
      isConfigured: jest.fn(() => true),
      refreshAccessToken: jest.fn().mockResolvedValue({
        access_token: 'new-access',
        expires_in: 86400,
        open_id: 'open-id',
        refresh_expires_in: 31536000,
        refresh_token: 'new-refresh',
        scope: 'user.info.basic,video.publish',
        token_type: 'Bearer',
      }),
    } as unknown as TikTokApiService;
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{
            user_id: 'owner-a',
            access_token_encrypted: encrypt('old-access'),
            refresh_token_encrypted: encrypt('old-refresh'),
            access_expires_at: new Date(Date.now() - 1000),
            refresh_expires_at: new Date(Date.now() + 60 * 60 * 1000),
            is_connected: true,
          }],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({
        rows: [{
          user_id: 'owner-a',
          access_token_encrypted: encrypt('old-access'),
          refresh_token_encrypted: encrypt('old-refresh'),
          access_expires_at: new Date(Date.now() - 1000),
          refresh_expires_at: new Date(Date.now() + 60 * 60 * 1000),
          is_connected: true,
        }],
      } as never);
    mockConnect.mockResolvedValueOnce(client as never);

    const token = await new TikTokCredentialsService(api).getValidAccessToken('owner-a');

    expect(token).toBe('new-access');
    expect(api.refreshAccessToken).toHaveBeenCalledWith('old-refresh');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE'),
      ['owner-a'],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('refresh_token_encrypted = $4'),
      expect.arrayContaining(['owner-a', 'open-id']),
    );
    expect(client.release).toHaveBeenCalled();
  });
});
