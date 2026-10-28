/** @jest-environment node */

import { createNetwork, fakeSecrets } from '../__mocks__/federation-fakes';

const NAPOLS = 'https://napols.example';
const UNIT2 = 'https://unit2.example';

function setup(unit2Env: Record<string, string> = {}) {
  const network = createNetwork([
    { origin: NAPOLS, name: 'napols' },
    { origin: UNIT2, name: 'unit2', env: unit2Env },
  ]);
  return { ...network, a: network.units.get(NAPOLS)!, b: network.units.get(UNIT2)! };
}

describe('federation pairing between two Units (mocked network)', () => {
  it('pairs, exchanges scoped keys, and revokes end to end', async () => {
    const { a, b } = setup();

    // 1. napols admin starts pairing and grants unit2 agents.list.
    const outbound = await a.service.initiate({ url: UNIT2, grants: ['federation.agents.list'], adminId: 'admin-a' });
    expect(outbound.status).toBe('pending_outbound');
    expect(outbound.verificationCode).toMatch(/^\d{6}$/);

    // 2. unit2 sees a pending request with the same code; nothing granted yet.
    const [inbound] = await b.service.list();
    expect(inbound).toMatchObject({ status: 'pending_inbound', unitName: 'napols', origin: NAPOLS });
    expect(inbound.verificationCode).toBe(outbound.verificationCode);
    expect(b.principals.principals.size).toBe(0);
    expect(a.principals.principals.size).toBe(0);

    // 3. unit2 admin accepts and grants agents.list + agents.ask.
    const accepted = await b.service.accept({
      peerId: inbound.id, grants: ['federation.agents.list', 'federation.agents.ask'], adminId: 'admin-b',
    });
    expect(accepted.status).toBe('active');

    // 4. Both sides are active with mirrored capabilities.
    const [aPeer] = await a.service.list();
    expect(aPeer).toMatchObject({
      status: 'active',
      inboundCapabilities: ['federation.agents.list'],
      outboundCapabilities: ['federation.agents.list', 'federation.agents.ask'],
      verificationCode: null,
    });
    expect(accepted.outboundCapabilities).toEqual(['federation.agents.list']);

    // Keys carry only mapped scopes (+ self-revoke) and are stored encrypted.
    const aRow = [...a.store.rows.values()][0];
    const bRow = [...b.store.rows.values()][0];
    const keyForA = fakeSecrets.decrypt(aRow.outboundKeyEncrypted!);
    const keyForB = fakeSecrets.decrypt(bRow.outboundKeyEncrypted!);
    expect(aRow.outboundKeyEncrypted).not.toContain(keyForA);
    expect(b.principals.keys.get(keyForA)?.scopes.sort()).toEqual(
      ['federation:agents:ask', 'federation:agents:list', 'federation:peer:revoke'],
    );
    expect(a.principals.keys.get(keyForB)?.scopes.sort()).toEqual(['federation:agents:list', 'federation:peer:revoke']);
    expect(b.principals.resolve(keyForA, 'federation:agents:ask')).not.toBeNull();
    expect(a.principals.resolve(keyForB, 'federation:agents:ask')).toBeNull();

    // Secrets are single use and cleared.
    expect(aRow.pairingSecretHash).toBeNull();
    expect(bRow.pairingSecretEncrypted).toBeNull();

    // No secrets in API views.
    expect(JSON.stringify(await a.service.list())).not.toContain(keyForA);

    // 5. unit2 revokes: both directions stop working.
    await b.service.revoke({ peerId: inbound.id });
    expect(b.principals.resolve(keyForA, 'federation:agents:list')).toBeNull();
    expect(a.principals.resolve(keyForB, 'federation:agents:list')).toBeNull();
    expect((await a.service.list())[0].status).toBe('revoked');
    expect((await b.service.list())[0].status).toBe('revoked');
  });

  it('rejects completion with a wrong pairing secret', async () => {
    const { a } = setup();
    const outbound = await a.service.initiate({ url: UNIT2, grants: [], adminId: 'admin-a' });
    const row = a.store.rows.get(outbound.id)!;
    await expect(a.service.complete(outbound.id, {
      pairingSecret: 'x'.repeat(43), nonce: row.nonceRemote!, key: 'alr_live_fake_key_123', capabilities: [],
    })).rejects.toMatchObject({ code: 'forbidden' });
    expect(a.principals.principals.size).toBe(0);
  });

  it('does not reach a public Unit that keeps pairing closed', async () => {
    const { a, b } = setup({ ALLERAC_PROFILE: 'openworld' });
    await expect(a.service.initiate({ url: UNIT2, grants: [], adminId: 'admin-a' }))
      .rejects.toMatchObject({ code: 'peer_not_accepting' });
    expect(b.store.rows.size).toBe(0);
  });

  it('lets the responder reject a request', async () => {
    const { a, b } = setup();
    await a.service.initiate({ url: UNIT2, grants: [], adminId: 'admin-a' });
    const [inbound] = await b.service.list();
    const rejected = await b.service.reject({ peerId: inbound.id, adminId: 'admin-b' });
    expect(rejected.status).toBe('rejected');
    await expect(b.service.accept({ peerId: inbound.id, adminId: 'admin-b' })).rejects.toMatchObject({ code: 'invalid_state' });
  });
});
