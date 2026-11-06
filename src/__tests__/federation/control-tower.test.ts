/** @jest-environment node */
import {
  ControlTowerHeartbeat, HeartbeatSweep, heartbeatEveryMs, nextBeatState, REFRESH_THROTTLE_MS, type BeatRecord, type HeartbeatStore,
} from '@/federation/control-tower.heartbeat';
import { ControlTowerService, type ControlTowerPeerRow } from '@/federation/control-tower';
import { FederationError } from '@/federation/errors';
import type { PeerRecord } from '@/federation/peer.types';
import type { FederationStatus } from '@/federation/status.schema';

const NOW = Date.parse('2026-11-01T18:00:00Z');

const status = (name: string, extra: Partial<FederationStatus> = {}): FederationStatus => ({
  version: 1, generated_at: new Date(NOW).toISOString(),
  unit: { name, display_name: name[0].toUpperCase() + name.slice(1), emoji: null, role: null, app_version: 'v149', commit: 'abc1234' },
  load: { runs_running: 1, runs_queued: 0, async_asks_running: 0, async_max_running: 4 },
  agents: [], runs: [], federated_asks: [], federation_events: [], granted_capabilities: [], truncated: false, ...extra,
});

const peer = (caps: string[], misses = 0) => ({
  id: 'peer-1', unitName: 'santos', displayName: 'Santos', origin: 'https://santos.example', status: 'active',
  outboundCapabilities: caps, consecutiveMisses: misses, lastSeenAt: null,
}) as unknown as PeerRecord & { consecutiveMisses: number };

function harness(peers: Array<PeerRecord & { consecutiveMisses: number }>) {
  let clock = NOW;
  const records: Array<{ peerId: string; beat: BeatRecord }> = [];
  const store: HeartbeatStore = {
    activePeers: jest.fn(async () => peers),
    record: jest.fn(async (peerId, beat) => { records.push({ peerId, beat }); }),
    prune: jest.fn(async () => 0),
  };
  const client = {
    getStatus: jest.fn(async () => { clock += 120; return status('santos', { granted_capabilities: ['federation.status.read', 'federation.agents.list'] }); }),
    listAgentsWithUnit: jest.fn(async () => ({ agents: [], unit: null, grantedCapabilities: ['federation.agents.list', 'federation.status.read'] })),
    syncGrantedCapabilities: jest.fn(async () => null as string[] | null),
  };
  const probeManifest = jest.fn(async () => ({}));
  const log = jest.fn();
  const heartbeat = new ControlTowerHeartbeat({ store, client: client as never, probeManifest, now: () => clock, log });
  return { heartbeat, store, client, probeManifest, records, log, tick: (ms: number) => { clock += ms; } };
}

describe('heartbeat state (P4d)', () => {
  it('goes online → degraded → offline after 3 misses, and back', () => {
    expect(nextBeatState(0, { ok: true, latencyMs: 100 })).toEqual({ state: 'online', misses: 0 });
    expect(nextBeatState(0, { ok: true, latencyMs: 2000 })).toEqual({ state: 'degraded', misses: 0 });
    expect(nextBeatState(0, { ok: false, latencyMs: null })).toEqual({ state: 'degraded', misses: 1 });
    expect(nextBeatState(1, { ok: false, latencyMs: null })).toEqual({ state: 'degraded', misses: 2 });
    expect(nextBeatState(2, { ok: false, latencyMs: null })).toEqual({ state: 'offline', misses: 3 });
    expect(nextBeatState(7, { ok: true, latencyMs: 10 })).toEqual({ state: 'online', misses: 0 });
  });

  it('reads the interval from env with a 15s floor', () => {
    expect(heartbeatEveryMs({})).toBe(60_000);
    expect(heartbeatEveryMs({ CONTROL_TOWER_HEARTBEAT_MS: '30000' })).toBe(30_000);
    expect(heartbeatEveryMs({ CONTROL_TOWER_HEARTBEAT_MS: '100' })).toBe(60_000);
  });
});

describe('ControlTowerHeartbeat (P4d)', () => {
  it('uses status when granted, stores the snapshot and syncs grants', async () => {
    const h = harness([peer(['federation.status.read', 'federation.agents.list'])]);
    await h.heartbeat.beatAll();
    expect(h.client.getStatus).toHaveBeenCalledWith('peer-1', { initiatedByUserId: null }, 3000);
    expect(h.records[0].beat).toMatchObject({ ok: true, state: 'online', misses: 0, latencyMs: 120, appVersion: 'v149', errorCode: null });
    expect(h.records[0].beat.snapshot?.unit.name).toBe('santos');
    expect(h.client.syncGrantedCapabilities).toHaveBeenCalledWith('peer-1', ['federation.status.read', 'federation.agents.list']);
    expect(h.store.prune).toHaveBeenCalledWith(new Date(NOW + 120 - 7 * 24 * 60 * 60 * 1000));
  });

  it('without status read, probes the agents list (no audit row) and learns a new grant', async () => {
    const h = harness([peer(['federation.agents.list'])]);
    h.client.syncGrantedCapabilities.mockResolvedValueOnce(['federation.agents.list', 'federation.status.read']);
    await h.heartbeat.beatAll();
    expect(h.client.getStatus).not.toHaveBeenCalled();
    expect(h.client.listAgentsWithUnit).toHaveBeenCalledWith('peer-1', { initiatedByUserId: null }, { timeoutMs: 3000, auditOk: false });
    expect(h.records[0].beat).toMatchObject({ ok: true, snapshot: null });
    expect(h.log).toHaveBeenCalledWith(expect.stringContaining('grants now'));
  });

  it('falls back to the public manifest when nothing is granted', async () => {
    const h = harness([peer([])]);
    await h.heartbeat.beatAll();
    expect(h.probeManifest).toHaveBeenCalledWith('https://santos.example');
    expect(h.records[0].beat.ok).toBe(true);
  });

  it('counts only unreachable peers as misses and marks offline on the 3rd', async () => {
    const h = harness([peer(['federation.status.read'], 2)]);
    h.client.getStatus.mockRejectedValueOnce(new FederationError('peer_unreachable', 'down', 502));
    await h.heartbeat.beatAll();
    expect(h.records[0].beat).toMatchObject({ ok: false, state: 'offline', misses: 3, latencyMs: null, errorCode: 'peer_unreachable' });
    expect(h.records[0].beat.snapshot).toBeUndefined();
    expect(h.log).toHaveBeenCalledWith(expect.stringContaining('offline'));
  });

  it('treats a refusal or disabled status as up, keeping the last snapshot', async () => {
    const h = harness([peer(['federation.status.read'], 1)]);
    h.client.getStatus.mockRejectedValueOnce(new FederationError('peer_status_disabled', 'off', 502));
    await h.heartbeat.beatAll();
    expect(h.records[0].beat).toMatchObject({ ok: true, state: 'online', misses: 0, errorCode: 'peer_status_disabled' });
    expect('snapshot' in h.records[0].beat).toBe(false);
  });

  it('throttles "refresh now" to once per 10s per peer', async () => {
    const h = harness([peer(['federation.status.read'])]);
    expect(await h.heartbeat.refresh()).toEqual({ refreshed: ['peer-1'], throttled: [] });
    expect(await h.heartbeat.refresh('peer-1')).toEqual({ refreshed: [], throttled: ['peer-1'] });
    h.tick(REFRESH_THROTTLE_MS);
    expect((await h.heartbeat.refresh('peer-1')).refreshed).toEqual(['peer-1']);
    expect((await h.heartbeat.refresh('other')).refreshed).toEqual([]);
  });

  it('sweep never overlaps and skips when another process holds the lock', async () => {
    let release: () => void = () => undefined;
    const beatAll = jest.fn(() => new Promise<number>(resolve => { release = () => resolve(1); }));
    const sweep = new HeartbeatSweep({ beatAll, withLock: task => task() });
    const first = sweep.runOnce();
    expect(await sweep.runOnce()).toBeNull();
    release();
    expect(await first).toBe(1);
    const locked = new HeartbeatSweep({ beatAll, withLock: async () => null });
    expect(await locked.runOnce()).toBeNull();
    const failing = new HeartbeatSweep({ beatAll: async () => { throw new Error('db'); }, withLock: task => task(), log: jest.fn() });
    expect(await failing.runOnce()).toBeNull();
  });
});

describe('ControlTowerService (P4d)', () => {
  const peerRow = (overrides: Partial<ControlTowerPeerRow> = {}): ControlTowerPeerRow => ({
    peer: { ...peer(['federation.status.read']), lastSeenAt: new Date(NOW - 200_000) } as never,
    beatState: 'online', consecutiveMisses: 0, lastBeatAt: new Date(NOW - 30_000), lastLatencyMs: 80, lastBeatError: null,
    snapshot: status('santos', {
      runs: [{ id: '0123456789abcdef', status: 'failed', started_at: new Date(NOW - 600_000).toISOString(), duration_ms: 5, tokens: 10, requested_by: 'local' }],
      federated_asks: [{ at: new Date(NOW - 7_200_000).toISOString(), direction: 'inbound', peer: 'napols', agent: 'chat', outcome: 'ok', http_status: 200, duration_ms: 900, error_code: null }],
      federation_events: [{ at: new Date(NOW - 60_000).toISOString(), direction: 'inbound', peer: 'napols', capability: 'federation.agents.ask', outcome: 'denied', http_status: 429, error_code: 'rate_limited' }],
    }),
    snapshotAt: new Date(NOW - 30_000), beats24h: { ok: 9, total: 10 }, ...overrides,
  });

  function service(rows: ControlTowerPeerRow[]) {
    return new ControlTowerService({
      store: {
        peers: async () => rows,
        inboxAsks: async () => [{ messageId: 'm1', threadId: 't1', peerName: 'santos', agentSlug: 'chat', status: 'pending', errorCode: null, createdAt: new Date(NOW - 5_000) }],
      },
      localStatus: async () => status('napols'),
      now: () => NOW,
    });
  }

  it('builds units (home first), activity across units, events and thread links', async () => {
    const view = await service([peerRow()]).overview({ userId: 'admin-1' });
    expect(view.units.map(unit => [unit.name, unit.isHome, unit.state, unit.limited])).toEqual([['napols', true, 'online', false], ['santos', false, 'online', false]]);
    expect(view.units[1]).toMatchObject({ latencyMs: 80, appVersion: 'v149', uptime24h: { ok: 9, total: 10 } });
    expect(view.activity.map(row => [row.kind, row.unit])).toEqual([['inbox', 'napols'], ['run', 'santos'], ['ask', 'santos']]);
    expect(view.activity[0]).toMatchObject({ threadId: 't1', running: true, target: '→ santos/chat' });
    expect(view.events).toHaveLength(1);
    expect(view.alerts).toEqual([]);
  });

  it('filters by window, unit and status', async () => {
    const svc = service([peerRow()]);
    expect((await svc.overview({ userId: 'a', window: '1h' })).activity.map(row => row.kind)).toEqual(['inbox', 'run']);
    expect((await svc.overview({ userId: 'a', unit: 'santos' })).activity.every(row => row.unit === 'santos')).toBe(true);
    expect((await svc.overview({ userId: 'a', status: 'failed' })).activity.map(row => row.kind)).toEqual(['run']);
    expect((await svc.overview({ userId: 'a', status: 'running' })).activity.map(row => row.kind)).toEqual(['inbox']);
  });

  it('raises a banner alert for offline units and marks limited ones', async () => {
    const view = await service([peerRow({
      beatState: 'offline', consecutiveMisses: 3, snapshot: null,
      peer: { ...peer(['federation.agents.list']), lastSeenAt: new Date(NOW - 200_000) } as never,
    })]).overview({ userId: 'a' });
    expect(view.alerts).toEqual([{ unitId: 'peer-1', unit: 'Santos', since: new Date(NOW - 200_000).toISOString(), misses: 3 }]);
    expect(view.units[1]).toMatchObject({ state: 'offline', limited: true, load: null });
  });
});
