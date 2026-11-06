/**
 * Control Tower heartbeat (federation P4d, home side).
 *
 * Every CONTROL_TOWER_HEARTBEAT_MS (default 60s) the home probes each active
 * peer with a 3s timeout and stores the beat. The probe is the richest call
 * the peer granted us:
 *  1. federation.status.read → GET /federation/status (snapshot + liveness);
 *  2. federation.agents.list → GET /federation/agents (liveness + grants);
 *  3. otherwise the public manifest (liveness only).
 * Only "could not reach the peer" counts as a miss; any HTTP answer (even a
 * refusal) means the unit is up. Three misses in a row mark it offline.
 * Grants the peer reports (`granted_capabilities`) are synced so a grant made
 * in place on the peer applies without re-pairing.
 */
import type { FederationClient } from './federation-client';
import { FederationError } from './errors';
import type { PeerRecord } from './peer.types';
import type { FederationStatus } from './status.schema';

export type BeatState = 'unknown' | 'online' | 'degraded' | 'offline';

export const DEFAULT_HEARTBEAT_EVERY_MS = 60_000;
export const MIN_HEARTBEAT_EVERY_MS = 15_000;
export const BEAT_TIMEOUT_MS = 3_000;
export const SLOW_BEAT_MS = 1_500;
export const OFFLINE_AFTER_MISSES = 3;
export const HEARTBEAT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const REFRESH_THROTTLE_MS = 10_000;

export function heartbeatEveryMs(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.CONTROL_TOWER_HEARTBEAT_MS);
  return Number.isInteger(value) && value >= MIN_HEARTBEAT_EVERY_MS ? value : DEFAULT_HEARTBEAT_EVERY_MS;
}

/** Pure state transition for one beat. */
export function nextBeatState(previousMisses: number, beat: { ok: boolean; latencyMs: number | null }): { state: BeatState; misses: number } {
  if (beat.ok) return { state: (beat.latencyMs ?? 0) > SLOW_BEAT_MS ? 'degraded' : 'online', misses: 0 };
  const misses = previousMisses + 1;
  return { state: misses >= OFFLINE_AFTER_MISSES ? 'offline' : 'degraded', misses };
}

export interface BeatRecord {
  at: Date;
  ok: boolean;
  latencyMs: number | null;
  appVersion: string | null;
  errorCode: string | null;
  state: BeatState;
  misses: number;
  /** New snapshot; `null` clears it (status no longer granted); undefined keeps the last one. */
  snapshot?: FederationStatus | null;
}

export interface HeartbeatStore {
  activePeers(): Promise<Array<PeerRecord & { consecutiveMisses: number }>>;
  record(peerId: string, beat: BeatRecord): Promise<void>;
  prune(before: Date): Promise<number>;
}

type ProbeClient = Pick<FederationClient, 'getStatus' | 'listAgentsWithUnit' | 'syncGrantedCapabilities'>;

export interface HeartbeatDeps {
  store: HeartbeatStore;
  client: ProbeClient;
  /** Unauthenticated liveness probe (public manifest). */
  probeManifest(origin: string): Promise<unknown>;
  now?: () => number;
  log?: (line: string) => void;
}

const unreachable = (error: unknown) => !(error instanceof FederationError) || error.code === 'peer_unreachable';
const errorCode = (error: unknown) => (error instanceof FederationError ? error.code : 'internal_error');

export class ControlTowerHeartbeat {
  private readonly now: () => number;
  private readonly lastRefresh = new Map<string, number>();
  private readonly ctx = { initiatedByUserId: null };

  constructor(private readonly deps: HeartbeatDeps) {
    this.now = deps.now ?? Date.now;
  }

  /** Beats every active peer in parallel, then prunes old beats. Returns the number of peers probed. */
  async beatAll(): Promise<number> {
    const peers = await this.deps.store.activePeers();
    await Promise.all(peers.map(peer => this.beat(peer)));
    await this.deps.store.prune(new Date(this.now() - HEARTBEAT_RETENTION_MS));
    return peers.length;
  }

  /** "Refresh now": one beat for one peer (or all), at most once per 10s per peer. */
  async refresh(peerId?: string | null): Promise<{ refreshed: string[]; throttled: string[] }> {
    const peers = (await this.deps.store.activePeers()).filter(peer => !peerId || peer.id === peerId);
    const refreshed: string[] = [];
    const throttled: string[] = [];
    const now = this.now();
    await Promise.all(peers.map(async peer => {
      const last = this.lastRefresh.get(peer.id) ?? 0;
      if (now - last < REFRESH_THROTTLE_MS) { throttled.push(peer.id); return; }
      this.lastRefresh.set(peer.id, now);
      await this.beat(peer);
      refreshed.push(peer.id);
    }));
    return { refreshed, throttled };
  }

  async beat(peer: PeerRecord & { consecutiveMisses: number }): Promise<BeatRecord> {
    const started = this.now();
    let ok = true;
    let code: string | null = null;
    let appVersion: string | null = null;
    let snapshot: FederationStatus | null | undefined;
    let granted: string[] | undefined;

    const caps = peer.outboundCapabilities;
    try {
      if (caps.includes('federation.status.read')) {
        try {
          const status = await this.deps.client.getStatus(peer.id, this.ctx, BEAT_TIMEOUT_MS);
          snapshot = status;
          appVersion = status.unit.app_version;
          granted = status.granted_capabilities;
        } catch (error) {
          if (unreachable(error)) throw error;
          // Up, but no status (flag off on the peer, refused, bad payload): keep the last snapshot.
          code = errorCode(error);
        }
      } else {
        snapshot = null;
        if (caps.includes('federation.agents.list')) {
          try {
            granted = (await this.deps.client.listAgentsWithUnit(peer.id, this.ctx, { timeoutMs: BEAT_TIMEOUT_MS, auditOk: false }))
              .grantedCapabilities;
          } catch (error) {
            if (unreachable(error)) throw error;
            code = errorCode(error);
          }
        } else {
          await this.deps.probeManifest(peer.origin);
        }
      }
    } catch (error) {
      ok = false;
      code = errorCode(error);
    }

    if (granted) {
      const changed = await this.deps.client.syncGrantedCapabilities(peer.id, granted).catch(() => null);
      if (changed) (this.deps.log ?? console.log)(`[ControlTower] ${peer.unitName} grants now: ${changed.join(', ') || 'none'}`);
    }
    const latencyMs = ok ? this.now() - started : null;
    const { state, misses } = nextBeatState(peer.consecutiveMisses, { ok, latencyMs });
    if (state === 'offline' && peer.consecutiveMisses < OFFLINE_AFTER_MISSES) {
      (this.deps.log ?? console.warn)(`[ControlTower] ${peer.unitName} is offline (${misses} missed beats)`);
    }
    const beat: BeatRecord = {
      at: new Date(this.now()), ok, latencyMs, appVersion, errorCode: code, state, misses,
      ...(snapshot !== undefined ? { snapshot } : {}),
    };
    await this.deps.store.record(peer.id, beat);
    return beat;
  }
}

/** Runs the heartbeat on an interval: no overlapping runs, one process at a time (lock). */
export class HeartbeatSweep {
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: {
    beatAll(): Promise<number>;
    withLock<T>(task: () => Promise<T>): Promise<T | null>;
    log?: (line: string) => void;
  }) {}

  async runOnce(): Promise<number | null> {
    if (this.running) return null;
    this.running = true;
    try {
      return await this.deps.withLock(() => this.deps.beatAll());
    } catch (error) {
      (this.deps.log ?? console.warn)(`[ControlTower] heartbeat failed: ${error instanceof Error ? error.message : 'error'}`);
      return null;
    } finally {
      this.running = false;
    }
  }

  start(everyMs: number): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.runOnce(); }, everyMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

const LOCK_SQL = "SELECT pg_try_advisory_lock(hashtext('allerac_control_tower_heartbeat')) AS acquired";
const UNLOCK_SQL = "SELECT pg_advisory_unlock(hashtext('allerac_control_tower_heartbeat'))";

/** Starts the DB-backed heartbeat (instrumentation, background workers only). CONTROL_TOWER_HEARTBEAT_ENABLED=false disables it. */
export async function startControlTowerHeartbeat(): Promise<void> {
  if (process.env.CONTROL_TOWER_HEARTBEAT_ENABLED === 'false') return;
  const pool = (await import('@/app/clients/db')).default;
  const { controlTowerHeartbeat } = await import('./control-tower.instance');
  const sweep = new HeartbeatSweep({
    beatAll: () => controlTowerHeartbeat.beatAll(),
    async withLock(task) {
      const client = await pool.connect();
      let locked = false;
      try {
        locked = !!(await client.query(LOCK_SQL)).rows[0]?.acquired;
        if (!locked) return null;
        return await task();
      } finally {
        if (locked) await client.query(UNLOCK_SQL).catch(() => undefined);
        client.release();
      }
    },
  });
  sweep.start(heartbeatEveryMs());
}
