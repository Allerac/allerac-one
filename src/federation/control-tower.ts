/**
 * Control Tower read model (federation P4d, home side, admin only).
 *
 * Reads only from the database: the home's own status (built locally with the
 * same StatusService peers use), each peer's beat state and latest validated
 * snapshot, and the admin's own outbound inbox asks (for thread links).
 * Opening the page never calls a peer. Metadata only.
 */
import { agentHref } from '@/app/components/inbox/agents-format';
import type { BeatState } from './control-tower.heartbeat';
import type { PeerRecord } from './peer.types';
import type { FederationStatus } from './status.schema';

export type ControlTowerWindow = '1h' | '24h';
export type ActivityFilter = 'all' | 'running' | 'failed';

export interface ControlTowerPeerRow {
  peer: PeerRecord;
  beatState: BeatState;
  consecutiveMisses: number;
  lastBeatAt: Date | null;
  lastLatencyMs: number | null;
  lastBeatError: string | null;
  snapshot: FederationStatus | null;
  snapshotAt: Date | null;
  beats24h: { ok: number; total: number };
}

export interface InboxAskRow {
  messageId: string;
  threadId: string;
  peerName: string;
  agentSlug: string;
  status: 'pending' | 'done' | 'failed' | 'timeout';
  errorCode: string | null;
  createdAt: Date;
}

export interface ControlTowerStore {
  peers(): Promise<ControlTowerPeerRow[]>;
  inboxAsks(userId: string, since: Date, limit: number): Promise<InboxAskRow[]>;
}

export interface UnitCard {
  id: string;
  isHome: boolean;
  name: string;
  displayName: string | null;
  emoji: string | null;
  role: string | null;
  state: BeatState;
  /** Peer did not grant federation.status.read: liveness only. */
  limited: boolean;
  lastBeatAt: string | null;
  latencyMs: number | null;
  errorCode: string | null;
  appVersion: string | null;
  commit: string | null;
  load: FederationStatus['load'] | null;
  snapshotAt: string | null;
  uptime24h: { ok: number; total: number } | null;
}

export interface ActivityRow {
  kind: 'run' | 'ask' | 'inbox';
  unit: string;
  at: string;
  status: string;
  /** Remote side for asks (`peer`), or `<peer>/<agent>` for inbox asks. */
  target: string | null;
  durationMs: number | null;
  tokens: number | null;
  errorCode: string | null;
  /** Local inbox thread for the admin's own asks. */
  threadId: string | null;
  /** Agent chat link for the admin's own asks (`/agents/<unit>/<agent>?thread=`). */
  link?: string | null;
  failed: boolean;
  running: boolean;
}

export interface EventRow {
  unit: string;
  at: string;
  direction: 'inbound' | 'outbound';
  peer: string | null;
  capability: string;
  outcome: string;
  httpStatus: number | null;
  errorCode: string | null;
}

export interface ControlTowerOverview {
  generatedAt: string;
  window: ControlTowerWindow;
  units: UnitCard[];
  activity: ActivityRow[];
  events: EventRow[];
  alerts: Array<{ unitId: string; unit: string; since: string | null; misses: number }>;
}

export interface ControlTowerDeps {
  store: ControlTowerStore;
  /** The home's own status (StatusService.build with no grants). */
  localStatus(): Promise<FederationStatus>;
  now?: () => number;
}

export const WINDOW_MS: Record<ControlTowerWindow, number> = { '1h': 60 * 60 * 1000, '24h': 24 * 60 * 60 * 1000 };
const MAX_ACTIVITY = 300;
const MAX_EVENTS = 200;
const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null);

function statusRows(unit: string, status: FederationStatus): { activity: ActivityRow[]; events: EventRow[] } {
  const activity: ActivityRow[] = [
    ...status.runs.map(run => ({
      kind: 'run' as const, unit, at: run.started_at ?? status.generated_at, status: run.status, target: null,
      durationMs: run.duration_ms, tokens: run.tokens, errorCode: null, threadId: null,
      failed: run.status === 'failed', running: run.status === 'running' || run.status === 'queued',
    })),
    ...status.federated_asks.map(ask => ({
      kind: 'ask' as const, unit, at: ask.at, status: ask.outcome,
      target: `${ask.direction === 'inbound' ? '←' : '→'} ${ask.peer ?? '?'}${ask.agent ? `/${ask.agent}` : ''}`,
      durationMs: ask.duration_ms, tokens: null, errorCode: ask.error_code, threadId: null,
      failed: ask.outcome !== 'ok', running: false,
    })),
  ];
  const events = status.federation_events.map(event => ({
    unit, at: event.at, direction: event.direction, peer: event.peer, capability: event.capability,
    outcome: event.outcome, httpStatus: event.http_status, errorCode: event.error_code,
  }));
  return { activity, events };
}

export class ControlTowerService {
  private readonly now: () => number;

  constructor(private readonly deps: ControlTowerDeps) {
    this.now = deps.now ?? Date.now;
  }

  async overview(params: { userId: string; window?: ControlTowerWindow; unit?: string | null; status?: ActivityFilter }): Promise<ControlTowerOverview> {
    const window = params.window ?? '24h';
    const now = this.now();
    const since = now - WINDOW_MS[window];
    const [home, peers, inbox] = await Promise.all([
      this.deps.localStatus(),
      this.deps.store.peers(),
      this.deps.store.inboxAsks(params.userId, new Date(since), MAX_ACTIVITY),
    ]);

    const units: UnitCard[] = [{
      id: 'home', isHome: true, name: home.unit.name, displayName: home.unit.display_name, emoji: home.unit.emoji,
      role: home.unit.role, state: 'online', limited: false, lastBeatAt: home.generated_at, latencyMs: 0, errorCode: null,
      appVersion: home.unit.app_version, commit: home.unit.commit, load: home.load, snapshotAt: home.generated_at, uptime24h: null,
    }];
    let activity: ActivityRow[] = [];
    let events: EventRow[] = [];
    const local = statusRows(home.unit.name, home);
    activity.push(...local.activity);
    events.push(...local.events);
    activity.push(...inbox.map(row => ({
      kind: 'inbox' as const, unit: home.unit.name, at: row.createdAt.toISOString(), status: row.status,
      target: `→ ${row.peerName}/${row.agentSlug}`, durationMs: null, tokens: null, errorCode: row.errorCode,
      threadId: row.threadId, link: agentHref(row.peerName, row.agentSlug, row.threadId),
      failed: row.status === 'failed' || row.status === 'timeout', running: row.status === 'pending',
    })));

    for (const row of peers) {
      const snapshot = row.snapshot;
      units.push({
        id: row.peer.id, isHome: false, name: row.peer.unitName,
        displayName: snapshot?.unit.display_name ?? row.peer.displayName, emoji: snapshot?.unit.emoji ?? null,
        role: snapshot?.unit.role ?? null, state: row.beatState,
        limited: !row.peer.outboundCapabilities.includes('federation.status.read'),
        lastBeatAt: iso(row.lastBeatAt), latencyMs: row.lastLatencyMs, errorCode: row.lastBeatError,
        appVersion: snapshot?.unit.app_version ?? null, commit: snapshot?.unit.commit ?? null,
        load: snapshot?.load ?? null, snapshotAt: iso(row.snapshotAt), uptime24h: row.beats24h,
      });
      if (snapshot) {
        const remote = statusRows(row.peer.unitName, snapshot);
        activity.push(...remote.activity);
        events.push(...remote.events);
      }
    }

    const inWindow = (at: string) => Date.parse(at) >= since;
    activity = activity.filter(row => inWindow(row.at) || row.running);
    events = events.filter(row => inWindow(row.at));
    if (params.unit) {
      activity = activity.filter(row => row.unit === params.unit);
      events = events.filter(row => row.unit === params.unit);
    }
    if (params.status === 'running') activity = activity.filter(row => row.running);
    if (params.status === 'failed') activity = activity.filter(row => row.failed);
    const byTime = (a: { at: string }, b: { at: string }) => Date.parse(b.at) - Date.parse(a.at);

    return {
      generatedAt: new Date(now).toISOString(),
      window,
      units,
      activity: activity.sort(byTime).slice(0, MAX_ACTIVITY),
      events: events.sort(byTime).slice(0, MAX_EVENTS),
      alerts: peers.filter(row => row.beatState === 'offline').map(row => ({
        unitId: row.peer.id, unit: row.peer.displayName ?? row.peer.unitName,
        since: iso(row.peer.lastSeenAt), misses: row.consecutiveMisses,
      })),
    };
  }
}
