/** @jest-environment node */

import '../../../__tests__/__mocks__/db';
import pool from '@/app/clients/db';
import {
  ServicePrincipalNameTakenError,
  ServicePrincipalService,
} from '@/app/services/service-principals/service-principal.service';
import { apiKeyService } from '@/app/services/api-keys/api-key.service';

const mockQuery = pool.query as unknown as jest.Mock;

const row = {
  id: 'principal-id', kind: 'peer', name: 'openworld', peer_url: 'https://openworld.example',
  acting_user_id: 'acting-user-id', created_by: 'admin-id', disabled_at: null,
  created_at: new Date('2026-10-28T00:00:00.000Z'),
};

describe('ServicePrincipalService', () => {
  let service: ServicePrincipalService;

  beforeEach(() => {
    jest.restoreAllMocks();
    mockQuery.mockReset();
    service = new ServicePrincipalService();
  });

  it('creates a peer principal', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [row] });
    const created = await service.create({
      name: 'openworld', peerUrl: 'https://openworld.example', actingUserId: 'acting-user-id', createdBy: 'admin-id',
    });
    expect(created).toMatchObject({ id: 'principal-id', kind: 'peer', name: 'openworld', actingUserId: 'acting-user-id' });
    expect(mockQuery.mock.calls[0][1]).toEqual(['openworld', 'https://openworld.example', 'acting-user-id', 'admin-id']);
  });

  it('maps unique violations to a name conflict', async () => {
    mockQuery.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    await expect(service.create({ name: 'openworld', actingUserId: 'u', createdBy: 'a' }))
      .rejects.toBeInstanceOf(ServicePrincipalNameTakenError);
  });

  it('disables a principal idempotently', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'principal-id' }], rowCount: 1 });
    await expect(service.disable('principal-id')).resolves.toBe(true);
    expect(mockQuery.mock.calls[0][0]).toContain('COALESCE(disabled_at, NOW())');
  });

  it('returns false when disabling an unknown principal', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(service.disable('missing')).resolves.toBe(false);
  });

  it('issues keys as the acting user, bound to the principal', async () => {
    const spy = jest.spyOn(apiKeyService, 'create').mockResolvedValue({} as never);
    await service.createKey({
      principal: { id: 'principal-id', kind: 'peer', name: 'openworld', peerUrl: null, actingUserId: 'acting-user-id', createdBy: null, disabledAt: null, createdAt: new Date() },
      name: 'openworld key',
      scopes: ['federation:agents:list'],
    });
    expect(spy).toHaveBeenCalledWith({
      userId: 'acting-user-id', name: 'openworld key', scopes: ['federation:agents:list'],
      expiresAt: null, principalId: 'principal-id',
    });
  });
});
