/** @jest-environment node */

import { createNetwork } from '../__mocks__/federation-fakes';
import { MAX_PENDING_INBOUND, PAIRING_TTL_MS, PairingService, verificationCode } from '@/federation/pairing.service';

const A = 'https://napols.example';
const B = 'https://unit2.example';

function twoUnits(bEnv: Record<string, string> = {}) {
  const network = createNetwork([{ origin: A, name: 'napols' }, { origin: B, name: 'unit2', env: bEnv }]);
  return { a: network.units.get(A)!, b: network.units.get(B)! };
}

const validRequest = (overrides: Record<string, unknown> = {}) => ({
  fromOrigin: A,
  fromRequestId: '6a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d',
  nonce: 'n'.repeat(32),
  pairingSecret: 's'.repeat(43),
  requestedCapabilities: ['federation.agents.list', 'made.up'],
  ...overrides,
});

describe('verificationCode', () => {
  const base = { initiatorNonce: 'a'.repeat(32), responderNonce: 'b'.repeat(32), initiatorOrigin: A, responderOrigin: B };
  it('is a stable 6-digit code', () => {
    expect(verificationCode(base)).toMatch(/^\d{6}$/);
    expect(verificationCode(base)).toBe(verificationCode({ ...base }));
  });
  it.each(['initiatorNonce', 'responderNonce', 'initiatorOrigin', 'responderOrigin'] as const)('changes with %s', field => {
    expect(verificationCode({ ...base, [field]: `${base[field]}x` })).not.toBe(verificationCode(base));
  });
});

describe('PairingService', () => {
  it('requires ALLERAC_PUBLIC_URL', async () => {
    const { a } = twoUnits();
    const service = new PairingService({ ...a.deps, env: {} });
    await expect(service.initiate({ url: B, grants: [], adminId: 'x' })).rejects.toMatchObject({ code: 'local_url_missing' });
  });

  it('refuses to pair with itself or twice with the same Unit', async () => {
    const { a } = twoUnits();
    await expect(a.service.initiate({ url: A, grants: [], adminId: 'x' })).rejects.toMatchObject({ code: 'invalid_url' });
    await a.service.initiate({ url: B, grants: [], adminId: 'x' });
    await expect(a.service.initiate({ url: B, grants: [], adminId: 'x' })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects unknown grant capabilities before contacting the peer', async () => {
    const { a, b } = twoUnits();
    await expect(a.service.initiate({ url: B, grants: ['made.up'], adminId: 'x' })).rejects.toMatchObject({ code: 'validation_error' });
    expect(b.store.rows.size).toBe(0);
  });

  it('requires https public hosts unless insecure peers are allowed', async () => {
    const { a } = twoUnits();
    await expect(a.service.discover('http://unit2.example')).rejects.toMatchObject({ code: 'insecure_url' });
    await expect(a.service.discover('https://192.168.1.10')).rejects.toMatchObject({ code: 'insecure_url' });
  });

  it('receives requests as pending only and keeps only advertised capabilities', async () => {
    const { b } = twoUnits();
    const result = await b.service.receiveRequest(validRequest(), '203.0.113.7');
    const row = b.store.rows.get(result.requestId)!;
    expect(row).toMatchObject({ status: 'pending_inbound', inboundCapabilities: ['federation.agents.list'], requestIp: '203.0.113.7' });
    expect(row.pairingSecretEncrypted).not.toContain('s'.repeat(43));
    expect(b.principals.principals.size).toBe(0);
  });

  it('refuses requests when pairing is closed', async () => {
    const { b } = twoUnits({ ALLERAC_PAIRING_ACCEPT: 'false' });
    await expect(b.service.receiveRequest(validRequest(), null)).rejects.toMatchObject({ status: 404 });
  });

  it('caps pending inbound requests', async () => {
    const { b } = twoUnits();
    for (let i = 0; i < MAX_PENDING_INBOUND; i += 1) {
      await b.store.insert({
        id: `p-${i}`, unitName: 'x', displayName: null, origin: `https://x${i}.example`, protocolVersion: '1',
        initiatedByUs: false, status: 'pending_inbound', inboundPrincipalId: null, inboundCapabilities: [],
        outboundCapabilities: [], outboundKeyEncrypted: null, outboundKeyPrefix: null, nonceLocal: null, nonceRemote: null,
        pairingSecretHash: null, pairingSecretEncrypted: null, remoteRequestId: null, requestIp: null,
        expiresAt: new Date(Date.now() + 60_000), createdBy: null,
      });
    }
    await expect(b.service.receiveRequest(validRequest(), null)).rejects.toMatchObject({ code: 'too_many_pending' });
  });

  it('expires pending requests after the TTL', async () => {
    const network = createNetwork([{ origin: A, name: 'napols' }, { origin: B, name: 'unit2' }]);
    const b = network.units.get(B)!;
    const result = await b.service.receiveRequest(validRequest(), null);
    const later = new PairingService({
      ...b.deps,
      now: () => new Date(Date.now() + PAIRING_TTL_MS + 1_000),
    });
    await expect(later.accept({ peerId: result.requestId, adminId: 'admin' })).rejects.toMatchObject({ code: 'expired' });
    expect(b.store.rows.get(result.requestId)!.status).toBe('expired');
  });

  it('disables the new principal when completion fails', async () => {
    const { a, b } = twoUnits();
    await a.service.initiate({ url: B, grants: [], adminId: 'x' });
    const [inbound] = await b.service.list();
    a.store.rows.clear(); // initiator lost its pending request
    await expect(b.service.accept({ peerId: inbound.id, adminId: 'admin-b' })).rejects.toBeTruthy();
    expect([...b.principals.principals.values()].every(p => p.disabled)).toBe(true);
    expect(b.store.rows.get(inbound.id)!.status).toBe('pending_inbound');
  });

  it('revokeByPeer disables the caller and marks the peer revoked', async () => {
    const { a, b } = twoUnits();
    await a.service.initiate({ url: B, grants: ['federation.agents.list'], adminId: 'x' });
    const [inbound] = await b.service.list();
    await b.service.accept({ peerId: inbound.id, adminId: 'admin-b' });
    const principalId = b.store.rows.get(inbound.id)!.inboundPrincipalId!;
    await expect(b.service.revokeByPeer(principalId)).resolves.toBe(true);
    expect(b.principals.principals.get(principalId)!.disabled).toBe(true);
    expect(b.store.rows.get(inbound.id)).toMatchObject({ status: 'revoked', outboundKeyEncrypted: null });
  });
});
