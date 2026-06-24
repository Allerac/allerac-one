/** @jest-environment node */

import '../../../__tests__/__mocks__/db';
import pool from '@/app/clients/db';
import { ApiKeyService } from '@/app/services/api-keys/api-key.service';

const mockQuery = (pool as any).query;

describe('ApiKeyService', () => {
  let service: ApiKeyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ApiKeyService();
  });

  it('creates API keys and only stores a hash', async () => {
    jest.spyOn(service, 'generateToken').mockReturnValue('alr_live_test_secret');
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'key-id',
        user_id: 'user-id',
        name: 'Bruno',
        token_prefix: 'alr_live_test_secret',
        scopes: [],
        last_used_at: null,
        revoked_at: null,
        expires_at: null,
        created_at: new Date('2026-06-24T00:00:00.000Z'),
      }],
    });

    const created = await service.create({ userId: 'user-id', name: 'Bruno' });

    expect(created.secret).toBe('alr_live_test_secret');
    expect(created.apiKey).toMatchObject({
      id: 'key-id',
      userId: 'user-id',
      name: 'Bruno',
      prefix: 'alr_live_test_secret',
    });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO control_api_keys'),
      [
        'user-id',
        'Bruno',
        'alr_live_test_secret',
        service.hashToken('alr_live_test_secret'),
        [],
        null,
      ],
    );
  });

  it('validates bearer tokens and updates last usage', async () => {
    const token = 'alr_live_valid_secret';
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          key_id: 'key-id',
          id: 'user-id',
          email: 'user@example.com',
          name: 'User',
          is_admin: false,
          created_at: new Date('2026-01-01T00:00:00.000Z'),
          scopes: ['profile:read'],
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const user = await service.validateBearerToken(token, 'profile:read');

    expect(user).toEqual({
      id: 'user-id',
      email: 'user@example.com',
      name: 'User',
      is_admin: false,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM control_api_keys k'),
      [service.tokenLookupPrefix(token), service.hashToken(token)],
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      'UPDATE control_api_keys SET last_used_at = NOW() WHERE id = $1',
      ['key-id'],
    );
  });

  it('rejects scoped tokens when the required scope is missing', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        key_id: 'key-id',
        id: 'user-id',
        email: 'user@example.com',
        name: 'User',
        is_admin: false,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        scopes: ['tickets:read'],
      }],
    });

    const user = await service.validateBearerToken('alr_live_valid_secret', 'tickets:write');

    expect(user).toBeNull();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('rejects tokens outside the Allerac key format', async () => {
    const user = await service.validateBearerToken('other-token');

    expect(user).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('revokes API keys for the owning user', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'key-id' }] });

    await expect(service.revoke({ userId: 'user-id', keyId: 'key-id' })).resolves.toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('SET revoked_at = COALESCE'),
      ['key-id', 'user-id'],
    );
  });
});
