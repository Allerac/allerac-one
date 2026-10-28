/** @jest-environment node */

import '../../../__tests__/__mocks__/db';
import pool from '@/app/clients/db';
import {
  ApiKeyInvalidScopesError,
  ApiKeyMissingScopeError,
  ApiKeyService,
} from '@/app/services/api-keys/api-key.service';

const mockQuery = pool.query as unknown as jest.Mock;

const serviceRow = (scopes: string[]) => ({
  key_id: 'key-id',
  id: 'acting-user-id',
  email: 'admin@example.com',
  name: 'Admin',
  is_admin: true,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  scopes,
  principal_id: 'principal-id',
  principal_name: 'openworld',
  principal_kind: 'peer',
});

describe('ApiKeyService service principal keys', () => {
  let service: ApiKeyService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
    service = new ApiKeyService();
  });

  it('creates a service key bound to a principal', async () => {
    jest.spyOn(service, 'generateToken').mockReturnValue('alr_live_service_secret');
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'key-id', user_id: 'acting-user-id', name: 'openworld', token_prefix: 'alr_live_service_secr',
        scopes: ['federation:agents:list'], last_used_at: null, revoked_at: null, expires_at: null,
        created_at: new Date(),
      }],
    });

    await service.create({
      userId: 'acting-user-id', name: 'openworld', scopes: ['federation:agents:list'], principalId: 'principal-id',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('principal_id'),
      expect.arrayContaining(['principal-id']),
    );
  });

  it('refuses non-allowed scopes for service keys', async () => {
    await expect(service.create({
      userId: 'acting-user-id', name: 'openworld', scopes: ['memory:read'], principalId: 'principal-id',
    })).rejects.toBeInstanceOf(ApiKeyInvalidScopesError);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses empty scope lists for service keys', async () => {
    await expect(service.create({
      userId: 'acting-user-id', name: 'openworld', scopes: [], principalId: 'principal-id',
    })).rejects.toBeInstanceOf(ApiKeyInvalidScopesError);
  });

  it('resolves a service key to its principal and records usage', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [serviceRow(['federation:agents:list'])] }).mockResolvedValue({ rows: [] });

    const user = await service.validateBearerToken('alr_live_service_secret', 'federation:agents:list');

    expect(user).toMatchObject({
      id: 'acting-user-id',
      principal: { id: 'principal-id', name: 'openworld', kind: 'peer' },
    });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO control_api_key_usage'),
      ['key-id', 'principal-id', 'federation:agents:list', true],
    );
  });

  it('only accepts keys of enabled principals', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(service.validateBearerToken('alr_live_service_secret', 'federation:agents:list')).resolves.toBeNull();
    expect(mockQuery.mock.calls[0][0]).toContain('sp.disabled_at IS NULL');
  });

  it('denies and records scopes outside the allow-list even if listed on the key', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [serviceRow(['memory:read'])] }).mockResolvedValue({ rows: [] });

    await expect(service.validateBearerToken('alr_live_service_secret', 'memory:read'))
      .rejects.toBeInstanceOf(ApiKeyMissingScopeError);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO control_api_key_usage'),
      ['key-id', 'principal-id', 'memory:read', false],
    );
  });

  it('denies service keys with empty scopes', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [serviceRow([])] }).mockResolvedValue({ rows: [] });
    await expect(service.validateBearerToken('alr_live_service_secret', 'federation:agents:list'))
      .rejects.toBeInstanceOf(ApiKeyMissingScopeError);
  });

  it('excludes service keys from personal key listing and revocation', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await service.list('user-id');
    await service.revoke({ userId: 'user-id', keyId: 'key-id' });
    expect(mockQuery.mock.calls[0][0]).toContain('principal_id IS NULL');
    expect(mockQuery.mock.calls[1][0]).toContain('principal_id IS NULL');
  });
});
