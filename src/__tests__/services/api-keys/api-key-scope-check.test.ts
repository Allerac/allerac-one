/** @jest-environment node */

import '../../../__tests__/__mocks__/db';
import pool from '@/app/clients/db';
import { ApiKeyInvalidScopesError, ApiKeyMissingScopeError, ApiKeyService } from '@/app/services/api-keys/api-key.service';

const mockQuery = jest.mocked(pool.query) as unknown as jest.Mock;

function keyRow(scopes: unknown) {
  return {
    key_id: 'key-id',
    id: 'user-id',
    email: 'user@example.com',
    name: 'User',
    is_admin: true,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    scopes,
  };
}

describe('ApiKeyService.validateBearerToken scope check', () => {
  let service: ApiKeyService;
  const token = 'alr_live_scope_test_secret';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ApiKeyService();
  });

  it('denies a key with an empty scope list', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [keyRow([])] });
    await expect(service.validateBearerToken(token, 'profile:read'))
      .rejects.toBeInstanceOf(ApiKeyMissingScopeError);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('denies a key whose scopes column is null', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [keyRow(null)] });
    await expect(service.validateBearerToken(token, 'chat:write'))
      .rejects.toBeInstanceOf(ApiKeyMissingScopeError);
  });
});

describe('ApiKeyService.validateBearerToken scope check (continued)', () => {
  const service = new ApiKeyService();
  const token = 'alr_live_scope_test_secret';

  beforeEach(() => jest.clearAllMocks());

  it('denies an unknown required scope even if the key lists it', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [keyRow(['made:up'])] });
    await expect(service.validateBearerToken(token, 'made:up'))
      .rejects.toBeInstanceOf(ApiKeyMissingScopeError);
  });

  it('does not treat "*" as a wildcard', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [keyRow(['*'])] });
    await expect(service.validateBearerToken(token, 'profile:read'))
      .rejects.toBeInstanceOf(ApiKeyMissingScopeError);
  });

  it('denies when the key has other scopes but not the required one', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [keyRow(['chat:read'])] });
    await expect(service.validateBearerToken(token, 'chat:write'))
      .rejects.toBeInstanceOf(ApiKeyMissingScopeError);
  });

  it('allows a key that lists the required scope and records usage', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [keyRow(['profile:read', 'chat:read', 'chat:write', 'capabilities:read'])] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(service.validateBearerToken(token, 'chat:write')).resolves.toMatchObject({ id: 'user-id' });
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

describe('ApiKeyService.create scope validation', () => {
  const service = new ApiKeyService();

  beforeEach(() => jest.clearAllMocks());

  it.each([[[]], [['*']], [['profile:read', 'nope:read']]])('refuses to create a key with scopes %j', async scopes => {
    await expect(service.create({ userId: 'u', name: 'k', scopes }))
      .rejects.toBeInstanceOf(ApiKeyInvalidScopesError);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
