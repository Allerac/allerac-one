/** @jest-environment node */
import { ControlTowerHeartbeat, type BeatRecord, type HeartbeatStore } from '@/federation/control-tower.heartbeat';
import { PeerClient } from '@/federation/peer-client';
import { createNetwork } from '../__mocks__/federation-fakes';

const NAPOLS = 'https://napols.example';
const SANTOS = 'https://santos.example';
const BARCELONA = 'https://barcelona.example';

describe('Control Tower across Units (mocked network, P4d)', () => {
  it('grant status read in place → home discovers it → snapshot; offline unit is detected', async () => {
    const network = createNetwork([
      { origin: NAPOLS, name: 'napols' },
      { origin: SANTOS, name: 'santos', env: { ALLERAC_FEDERATION_AGENTS: 'chat', ALLERAC_FEDERATION_STATUS: 'on' } },
      { origin: BARCELONA, name: 'barcelona', env: { ALLERAC_FEDERATION_AGENTS: 'chat' } },
    ]);
    const home = network.units.get(NAPOLS)!;
    const santos = network.units.get(SANTOS)!;
    const barcelona = network.units.get(BARCELONA)!;
    for (const [origin, unit] of [[SANTOS, santos], [BARCELONA, barcelona]] as const) {
      await home.service.initiate({ url: origin, grants: [], adminId: 'admin-a' });
      const [inbound] = await unit.service.list();
      await unit.service.accept({ peerId: inbound.id, grants: ['federation.agents.list', 'federation.agents.ask'], adminId: 'admin-b' });
    }

    const misses = new Map<string, number>();
    const beats: Array<{ peerId: string; beat: BeatRecord }> = [];
    const store: HeartbeatStore = {
      activePeers: async () => (await home.store.list()).filter(peer => peer.status === 'active')
        .map(peer => ({ ...peer, consecutiveMisses: misses.get(peer.id) ?? 0 })),
      record: async (peerId, beat) => { misses.set(peerId, beat.misses); beats.push({ peerId, beat }); },
      prune: async () => 0,
    };
    const heartbeat = new ControlTowerHeartbeat({
      store, client: home.client, probeManifest: origin => new PeerClient(network.fetchImpl, 1_000).fetchManifest(origin), log: () => undefined,
    });
    const peerId = async (name: string) => (await home.store.list()).find(peer => peer.unitName === name)!.id;

    // Before the grant: liveness only, no snapshot.
    await heartbeat.beatAll();
    expect(beats.every(entry => entry.beat.ok && entry.beat.snapshot === null)).toBe(true);
    expect(network.calls.some(call => call.includes('/federation/status'))).toBe(false);

    // Santos admin clicks "Grant status read" on the existing pairing (no new key, no re-pairing).
    const [homeOnSantos] = await santos.store.list();
    await santos.grants.update({ peerId: homeOnSantos.id, add: ['federation.status.read'], adminId: 'admin-b' });
    expect(santos.audit.entries.some(entry => entry.capability === 'federation.grants.update')).toBe(true);
    // Barcelona has not opted in, so it cannot grant it.
    const [homeOnBarcelona] = await barcelona.store.list();
    await expect(barcelona.grants.update({ peerId: homeOnBarcelona.id, add: ['federation.status.read'], adminId: 'admin-b' }))
      .rejects.toMatchObject({ status: 400 });

    // Next beat: the home learns the grant from granted_capabilities; the one after reads status.
    beats.length = 0;
    await heartbeat.beatAll();
    expect((await home.store.get(await peerId('santos')))!.outboundCapabilities).toContain('federation.status.read');
    beats.length = 0;
    await heartbeat.beatAll();
    const santosId = await peerId('santos');
    const snapshot = beats.find(entry => entry.peerId === santosId)?.beat.snapshot;
    expect(snapshot?.unit.name).toBe('santos');
    expect(snapshot?.granted_capabilities).toContain('federation.status.read');
    // Successful status reads leave no audit row on the home; asks and denials still do.
    expect(home.audit.entries.some(entry => entry.capability === 'federation.status.read')).toBe(false);

    // Barcelona goes dark: three missed beats → offline.
    network.units.delete(BARCELONA);
    for (let index = 0; index < 3; index += 1) await heartbeat.beatAll();
    const barcelonaId = await peerId('barcelona');
    const last = beats.filter(entry => entry.peerId === barcelonaId).at(-1)!.beat;
    expect(last).toMatchObject({ ok: false, state: 'offline', misses: 3, errorCode: 'peer_unreachable' });
  });
});
