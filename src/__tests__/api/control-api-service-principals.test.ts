/** @jest-environment node */

import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { servicePrincipalService } from '@/app/services/service-principals/service-principal.service';
import { GET as listPrincipals, POST as createPrincipal } from '@/app/api/v1/service-principals/route';
import { DELETE as disablePrincipal } from '@/app/api/v1/service-principals/[id]/route';
import { POST as createPrincipalKey } from '@/app/api/v1/service-principals/[id]/keys/route';

jest.mock('@/app/lib/auth-session', () => {
  class MockUnauthorizedError extends Error {}
  class MockForbiddenError extends Error {}
  return {
    UnauthorizedError: MockUnauthorizedError,
    ForbiddenError: MockForbiddenError,
    requireCurrentUser: jest.fn(),
    assertDomainAccess: jest.fn(),
  };
});

jest.mock('@/app/services/service-principals/service-principal.service', () => ({
  ServicePrincipalNameTakenError: class extends Error {},
  servicePrincipalService: {
    list: jest.fn(),
    create: jest.fn(),
    get: jest.fn(),
    disable: jest.fn(),
    createKey: jest.fn(),
  },
}));

const mockUser = jest.mocked(requireCurrentUser);
const svc = jest.mocked(servicePrincipalService);

const admin = { id: '11111111-1111-4111-8111-111111111111', email: 'a@example.com', name: 'Admin', is_admin: true, created_at: new Date() };
const member = { ...admin, id: '22222222-2222-4222-8222-222222222222', is_admin: false };
const principal = {
  id: 'principal-id', kind: 'peer', name: 'openworld', peerUrl: null, actingUserId: admin.id,
  createdBy: admin.id, disabledAt: null, createdAt: new Date('2026-10-28T00:00:00.000Z'),
};
const ctx = { params: Promise.resolve({ id: 'principal-id' }) };

function json(body: unknown, headers?: HeadersInit): Request {
  return new Request('http://localhost/api/v1/service-principals', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('Control API v1 service principals', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists principals for admins', async () => {
    mockUser.mockResolvedValue(admin as never);
    svc.list.mockResolvedValue([principal]);
    const response = await listPrincipals();
    expect(response.status).toBe(200);
    expect((await response.json()).data.servicePrincipals[0]).toMatchObject({ name: 'openworld', kind: 'peer' });
  });

  it('returns 403 for non-admins', async () => {
    mockUser.mockResolvedValue(member as never);
    expect((await listPrincipals()).status).toBe(403);
    expect((await createPrincipal(json({ name: 'x' }))).status).toBe(403);
    expect(svc.create).not.toHaveBeenCalled();
  });

  it('requires a session (bearer keys cannot manage principals)', async () => {
    mockUser.mockRejectedValue(new UnauthorizedError());
    const response = await createPrincipal(json({ name: 'x' }, { Authorization: 'Bearer alr_live_service' }));
    expect(response.status).toBe(401);
  });

  it('creates a principal acting as the admin by default', async () => {
    mockUser.mockResolvedValue(admin as never);
    svc.create.mockResolvedValue(principal);
    const response = await createPrincipal(json({ name: 'openworld' }));
    expect(response.status).toBe(201);
    expect(svc.create).toHaveBeenCalledWith({ name: 'openworld', peerUrl: null, actingUserId: admin.id, createdBy: admin.id });
  });

  it('disables a principal', async () => {
    mockUser.mockResolvedValue(admin as never);
    svc.disable.mockResolvedValue(true);
    expect((await disablePrincipal(new Request('http://localhost'), ctx)).status).toBe(200);
  });

  it('issues a key with allowed scopes and returns the secret once', async () => {
    mockUser.mockResolvedValue(admin as never);
    svc.get.mockResolvedValue(principal);
    svc.createKey.mockResolvedValue({
      apiKey: {
        id: 'key-id', userId: admin.id, name: 'k', prefix: 'alr_live_x', scopes: ['federation:agents:list'],
        lastUsedAt: null, revokedAt: null, expiresAt: null, createdAt: new Date(),
      },
      secret: 'alr_live_secret',
    });
    const response = await createPrincipalKey(json({ name: 'k', scopes: ['federation:agents:list'] }), ctx);
    expect(response.status).toBe(201);
    expect((await response.json()).data.secret).toBe('alr_live_secret');
  });

  it('rejects scopes outside the service allow-list', async () => {
    mockUser.mockResolvedValue(admin as never);
    const response = await createPrincipalKey(json({ name: 'k', scopes: ['memory:read'] }), ctx);
    expect(response.status).toBe(403);
    expect(svc.createKey).not.toHaveBeenCalled();
  });

  it('refuses keys for disabled principals', async () => {
    mockUser.mockResolvedValue(admin as never);
    svc.get.mockResolvedValue({ ...principal, disabledAt: new Date() });
    const response = await createPrincipalKey(json({ name: 'k', scopes: ['federation:agents:list'] }), ctx);
    expect(response.status).toBe(409);
  });
});
