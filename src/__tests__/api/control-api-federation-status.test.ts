/** @jest-environment node */
import { apiKeyService } from '@/app/services/api-keys/api-key.service';
import { requireCurrentUser } from '@/app/lib/auth-session';
import { GET as getStatus } from '@/app/api/v1/federation/status/route';
import { POST as postGrants } from '@/app/api/v1/peers/[id]/grants/route';
import { grantsService } from '@/federation/grants.instance';
import { peerRepository } from '@/federation/peer.repository';
import { statusService } from '@/federation/status.instance';
import { FederationError } from '@/federation/errors';

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
jest.mock('@/app/services/api-keys/api-key.service', () => ({
  ApiKeyMissingScopeError: class extends Error {},
  apiKeyService: { validateBearerToken: jest.fn() },
}));
jest.mock('@/federation/status.instance', () => ({ statusService: { build: jest.fn() } }));
jest.mock('@/federation/grants.instance', () => ({ grantsService: { grantedCapabilities: jest.fn(), update: jest.fn() } }));
jest.mock('@/federation/peer.repository', () => ({ peerRepository: { findActiveByPrincipal: jest.fn() } }));
jest.mock('@/federation/pairing.instance', () => ({ pairingService: { toView: (peer: { id: string }) => ({ id: peer.id, view: true }) } }));

const validate = jest.mocked(apiKeyService.validateBearerToken);
const serviceCaller = {
  id: 'user-b', email: 'b@example.com', name: 'B', is_admin: false, created_at: new Date(),
  principal: { id: 'principal-1', name: 'peer:napols', kind: 'peer' },
};
const auth = { Authorization: 'Bearer alr_live_service' };
const PEER = '11111111-1111-4111-8111-111111111111';

describe('GET /api/v1/federation/status (P4d)', () => {
  const env = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...env, ALLERAC_FEDERATION_STATUS: 'on' };
  });
  afterAll(() => { process.env = env; });

  it('requires the status scope', async () => {
    validate.mockResolvedValueOnce(null as never);
    const response = await getStatus(new Request('http://x/api/v1/federation/status', { headers: auth }));
    expect(response.status).toBe(401);
    expect(validate).toHaveBeenCalledWith('alr_live_service', 'federation:status:read');
    expect(statusService.build).not.toHaveBeenCalled();
  });

  it('is 404 status_disabled when the unit has not opted in', async () => {
    process.env = { ...env };
    delete process.env.ALLERAC_FEDERATION_STATUS;
    validate.mockResolvedValueOnce(serviceCaller as never);
    const response = await getStatus(new Request('http://x', { headers: auth }));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('status_disabled');
  });

  it('rejects personal keys and inactive peers', async () => {
    validate.mockResolvedValueOnce({ ...serviceCaller, principal: null } as never);
    expect((await getStatus(new Request('http://x', { headers: auth }))).status).toBe(403);
    validate.mockResolvedValueOnce(serviceCaller as never);
    jest.mocked(peerRepository.findActiveByPrincipal).mockResolvedValueOnce(null);
    expect((await getStatus(new Request('http://x', { headers: auth }))).status).toBe(403);
  });

  it('returns the status with the caller grants and a clamped since', async () => {
    validate.mockResolvedValueOnce(serviceCaller as never);
    jest.mocked(peerRepository.findActiveByPrincipal).mockResolvedValueOnce({ id: 'peer-1' } as never);
    jest.mocked(grantsService.grantedCapabilities).mockResolvedValueOnce(['federation.status.read']);
    jest.mocked(statusService.build).mockResolvedValueOnce({ version: 1 } as never);
    const response = await getStatus(new Request('http://x/api/v1/federation/status?since=2026-11-01T00:00:00Z', { headers: auth }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { version: 1 } });
    expect(statusService.build).toHaveBeenCalledWith({ since: new Date('2026-11-01T00:00:00Z'), grantedCapabilities: ['federation.status.read'] });
  });
});

describe('POST /api/v1/peers/:id/grants (P4d)', () => {
  beforeEach(() => jest.clearAllMocks());
  const post = (body: unknown) => new Request(`http://x/api/v1/peers/${PEER}/grants`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const ctx = { params: Promise.resolve({ id: PEER }) };

  it('is session-admin only', async () => {
    jest.mocked(requireCurrentUser).mockResolvedValueOnce({ id: 'u', is_admin: false } as never);
    const response = await postGrants(post({ add: ['federation.status.read'] }), ctx);
    expect(response.status).toBe(403);
    expect(grantsService.update).not.toHaveBeenCalled();
  });

  it('grants status read on the existing pairing', async () => {
    jest.mocked(requireCurrentUser).mockResolvedValueOnce({ id: 'admin-1', is_admin: true } as never);
    jest.mocked(grantsService.update).mockResolvedValueOnce({ id: PEER } as never);
    const response = await postGrants(post({ add: ['federation.status.read'] }), ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { peer: { id: PEER, view: true } } });
    expect(grantsService.update).toHaveBeenCalledWith({ peerId: PEER, add: ['federation.status.read'], remove: undefined, adminId: 'admin-1' });
  });

  it('validates the payload and maps service errors', async () => {
    jest.mocked(requireCurrentUser).mockResolvedValue({ id: 'admin-1', is_admin: true } as never);
    expect((await postGrants(post({ add: 'x' }), ctx)).status).toBe(400);
    jest.mocked(grantsService.update).mockRejectedValueOnce(new FederationError('validation_error', 'Unknown', 400));
    expect((await postGrants(post({ add: ['made.up'] }), ctx)).status).toBe(400);
    expect((await postGrants(post({ add: [] }), { params: Promise.resolve({ id: 'nope' }) })).status).toBe(404);
  });
});
