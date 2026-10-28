/** @jest-environment node */

import { requireCurrentUser } from '@/app/lib/auth-session';
import { resetOperationLimitsForTests } from '@/app/lib/operation-limiter';
import { pairingService } from '@/federation/pairing.instance';
import { FederationError } from '@/federation/errors';
import { GET as listPeers, POST as startPairing } from '@/app/api/v1/peers/route';
import { POST as discoverPeer } from '@/app/api/v1/peers/discover/route';
import { DELETE as revokePeer } from '@/app/api/v1/peers/[id]/route';
import { POST as acceptPeer } from '@/app/api/v1/peers/[id]/accept/route';
import { POST as rejectPeer } from '@/app/api/v1/peers/[id]/reject/route';
import { POST as receivePairing } from '@/app/api/v1/federation/pairing/route';
import { POST as completePairing } from '@/app/api/v1/federation/pairing/[id]/complete/route';
import { POST as peerRevoke } from '@/app/api/v1/federation/peer/revoke/route';
import { apiKeyService } from '@/app/services/api-keys/api-key.service';

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

jest.mock('@/federation/pairing.instance', () => ({
  pairingService: {
    list: jest.fn(), discover: jest.fn(), initiate: jest.fn(), accept: jest.fn(), reject: jest.fn(),
    revoke: jest.fn(), receiveRequest: jest.fn(), complete: jest.fn(), revokeByPeer: jest.fn(),
  },
}));

const mockUser = jest.mocked(requireCurrentUser);
const svc = jest.mocked(pairingService);
const admin = { id: 'admin-id', email: 'a@example.com', name: 'Admin', is_admin: true, created_at: new Date() };
const member = { ...admin, id: 'member-id', is_admin: false };
const ctx = { params: Promise.resolve({ id: 'peer-id' }) };
const post = (url: string, body?: unknown, headers?: HeadersInit) => new Request(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
});
const validRequest = {
  fromOrigin: 'https://napols.example', fromRequestId: '6a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d',
  nonce: 'n'.repeat(32), pairingSecret: 's'.repeat(43), requestedCapabilities: [],
};
const ORIGINAL_ENV = process.env;

describe('Control API v1 peers (admin)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires an admin session for every peers route', async () => {
    mockUser.mockResolvedValue(member as never);
    expect((await listPeers()).status).toBe(403);
    expect((await startPairing(post('http://x/api/v1/peers', { url: 'https://u.example', grants: [] }))).status).toBe(403);
    expect((await discoverPeer(post('http://x/api/v1/peers/discover', { url: 'https://u.example' }))).status).toBe(403);
    expect((await acceptPeer(post('http://x', {}), ctx)).status).toBe(403);
    expect((await rejectPeer(post('http://x'), ctx)).status).toBe(403);
    expect((await revokePeer(new Request('http://x', { method: 'DELETE' }), ctx)).status).toBe(403);
    expect(svc.initiate).not.toHaveBeenCalled();
  });

  it('starts pairing as the initiator', async () => {
    mockUser.mockResolvedValue(admin as never);
    svc.initiate.mockResolvedValue({ id: 'peer-id', status: 'pending_outbound' } as never);
    const response = await startPairing(post('http://x/api/v1/peers', { url: 'https://u.example', grants: ['federation.agents.list'] }));
    expect(response.status).toBe(201);
    expect(svc.initiate).toHaveBeenCalledWith({ url: 'https://u.example', grants: ['federation.agents.list'], adminId: 'admin-id' });
  });

  it('maps federation errors to their status', async () => {
    mockUser.mockResolvedValue(admin as never);
    svc.accept.mockRejectedValue(new FederationError('expired', 'Pairing request expired', 410));
    const response = await acceptPeer(post('http://x', {}), ctx);
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ error: { code: 'expired' } });
  });

  it('validates payloads', async () => {
    mockUser.mockResolvedValue(admin as never);
    expect((await startPairing(post('http://x/api/v1/peers', { url: 'https://u.example' }))).status).toBe(400);
  });
});

describe('Control API v1 federation endpoints (Unit to Unit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetOperationLimitsForTests();
    process.env = { ...ORIGINAL_ENV, ALLERAC_PROFILE: 'personal', ALLERAC_PAIRING_ACCEPT: 'true' };
  });
  afterAll(() => { process.env = ORIGINAL_ENV; });

  it('returns 404 when pairing is closed', async () => {
    process.env.ALLERAC_PAIRING_ACCEPT = 'false';
    expect((await receivePairing(post('http://x/api/v1/federation/pairing', validRequest))).status).toBe(404);
    expect(svc.receiveRequest).not.toHaveBeenCalled();
  });

  it('returns 404 on a public profile by default', async () => {
    process.env.ALLERAC_PROFILE = 'openworld';
    expect((await receivePairing(post('http://x/api/v1/federation/pairing', validRequest))).status).toBe(404);
  });

  it('accepts a valid request as pending (202)', async () => {
    svc.receiveRequest.mockResolvedValue({ requestId: 'r', nonce: 'n' });
    const response = await receivePairing(post('http://x/api/v1/federation/pairing', validRequest, { 'cf-connecting-ip': '203.0.113.7' }));
    expect(response.status).toBe(202);
    expect(svc.receiveRequest).toHaveBeenCalledWith(validRequest, '203.0.113.7');
  });

  it('rejects malformed requests', async () => {
    expect((await receivePairing(post('http://x/api/v1/federation/pairing', { ...validRequest, extra: 1 }))).status).toBe(400);
  });

  it('rate limits pairing requests (429)', async () => {
    process.env.RATE_LIMIT_FEDERATION_PAIRING_REQUESTS = '2';
    svc.receiveRequest.mockResolvedValue({ requestId: 'r', nonce: 'n' });
    for (let i = 0; i < 2; i += 1) {
      expect((await receivePairing(post('http://x/api/v1/federation/pairing', validRequest))).status).toBe(202);
    }
    expect((await receivePairing(post('http://x/api/v1/federation/pairing', validRequest))).status).toBe(429);
  });

  it('completes a pairing with a valid body', async () => {
    svc.complete.mockResolvedValue({ key: 'alr_live_k', capabilities: [] });
    const body = { pairingSecret: 's'.repeat(43), nonce: 'n'.repeat(32), key: 'alr_live_abcdefghijklmnop', capabilities: [] };
    const response = await completePairing(post('http://x', body), ctx);
    expect(response.status).toBe(200);
    expect(svc.complete).toHaveBeenCalledWith('peer-id', body);
  });

  it('peer self-revoke requires a service key', async () => {
    jest.mocked(apiKeyService.validateBearerToken).mockResolvedValueOnce({
      id: 'u', email: 'u@example.com', name: 'U', is_admin: false, created_at: new Date(),
      principal: { id: 'principal-id', name: 'peer:napols', kind: 'peer' },
    } as never);
    const response = await peerRevoke(post('http://x', undefined, { Authorization: 'Bearer alr_live_service' }));
    expect(response.status).toBe(200);
    expect(apiKeyService.validateBearerToken).toHaveBeenCalledWith('alr_live_service', 'federation:peer:revoke');
    expect(svc.revokeByPeer).toHaveBeenCalledWith('principal-id');

    jest.mocked(apiKeyService.validateBearerToken).mockResolvedValueOnce({
      id: 'u', email: 'u@example.com', name: 'U', is_admin: false, created_at: new Date(),
    } as never);
    expect((await peerRevoke(post('http://x', undefined, { Authorization: 'Bearer alr_live_user' }))).status).toBe(403);
  });
});
