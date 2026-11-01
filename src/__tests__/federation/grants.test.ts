/** @jest-environment node */
import { GrantsService, type FederationKeyStore } from '@/federation/grants';
import type { PeerRecord, PeerStore } from '@/federation/peer.types';

function setup(peer: Partial<PeerRecord> = {}) {
  let record = { id: 'peer-1', status: 'active', inboundPrincipalId: 'principal-1', inboundCapabilities: ['federation.agents.list'], unitName: 'santos', ...peer } as PeerRecord;
  let scopes = ['federation:agents:list', 'federation:agents:ask', 'federation:peer:revoke'];
  const keys: FederationKeyStore = {
    scopesFor: jest.fn(async () => scopes),
    setScopes: jest.fn(async (_principal, next) => { scopes = next; return 1; }),
  };
  const peers = {
    get: jest.fn(async () => record),
    update: jest.fn(async (_id, patch) => { record = { ...record, ...patch }; return record; }),
  } as unknown as PeerStore;
  const audit = { record: jest.fn(async () => undefined) };
  const service = new GrantsService({ peers, keys, audit, env: { ALLERAC_FEDERATION_STATUS: 'on' } });
  return { service, keys, audit, get scopes() { return scopes; } };
}

describe('GrantsService (P4d)', () => {
  it('adds status read to the existing key in place and audits it', async () => {
    const ctx = setup();
    const peer = await ctx.service.update({ peerId: 'peer-1', add: ['federation.status.read'], adminId: 'admin-1' });
    expect(ctx.scopes).toEqual(['federation:agents:list', 'federation:agents:ask', 'federation:peer:revoke', 'federation:status:read']);
    expect(ctx.keys.setScopes).toHaveBeenCalledWith('principal-1', expect.any(Array));
    expect(peer.inboundCapabilities).toEqual(['federation.agents.list', 'federation.agents.ask', 'federation.status.read']);
    expect(ctx.audit.record).toHaveBeenCalledWith(expect.objectContaining({
      capability: 'federation.grants.update', target: '+federation.status.read', userId: 'admin-1', outcome: 'ok',
    }));
  });

  it('removes a capability but always keeps the revoke scope', async () => {
    const ctx = setup();
    await ctx.service.update({ peerId: 'peer-1', remove: ['federation.agents.ask'], adminId: 'admin-1' });
    expect(ctx.scopes).toEqual(['federation:agents:list', 'federation:peer:revoke']);
  });

  it('refuses capabilities this unit does not advertise (flag off) and unknown ids', async () => {
    const ctx = setup();
    const off = new GrantsService({ peers: { get: async () => ({ id: 'p', status: 'active', inboundPrincipalId: 'x' }) } as never, keys: ctx.keys, audit: ctx.audit, env: {} });
    await expect(off.update({ peerId: 'p', add: ['federation.status.read'], adminId: 'a' })).rejects.toMatchObject({ status: 400 });
    await expect(ctx.service.update({ peerId: 'peer-1', add: ['chat.read'], adminId: 'a' })).rejects.toMatchObject({ status: 400 });
    await expect(ctx.service.update({ peerId: 'peer-1', remove: ['made.up'], adminId: 'a' })).rejects.toMatchObject({ status: 400 });
    await expect(ctx.service.update({ peerId: 'peer-1', adminId: 'a' })).rejects.toMatchObject({ status: 400 });
    expect(ctx.keys.setScopes).not.toHaveBeenCalled();
  });

  it('only touches active pairings with a federation principal', async () => {
    for (const peer of [{ status: 'revoked' as const }, { inboundPrincipalId: null }]) {
      const ctx = setup(peer);
      await expect(ctx.service.update({ peerId: 'peer-1', add: ['federation.status.read'], adminId: 'a' })).rejects.toMatchObject({ status: 409 });
    }
  });

  it('reports the caller key grants as capability ids', async () => {
    const ctx = setup();
    expect(await ctx.service.grantedCapabilities('principal-1')).toEqual(['federation.agents.list', 'federation.agents.ask']);
  });
});
