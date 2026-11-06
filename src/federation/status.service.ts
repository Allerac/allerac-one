/**
 * Builds this Unit's Control Tower status (federation P4d).
 *
 * Privacy: each output field is picked by name from typed source rows, never
 * spread, and the result is validated against the strict schema. Prompts,
 * plans, results, answers, titles and user identities are never read into it.
 */
import { createHash } from 'node:crypto';
import { DEFAULT_ASYNC_MAX_RUNNING } from './agents.service';
import { envList, exposedAgentSlugs, type Env } from './env';
import {
  federationStatusSchema, STATUS_MAX_ROWS, STATUS_VERSION, STATUS_WINDOW_MS,
  type FederationStatus, type StatusAsk, type StatusEvent, type StatusRun,
} from './status.schema';

export interface StatusRunRow { id: string; status: string; startedAt: Date | null; completedAt: Date | null; tokens: number | null }
export interface StatusAuditRow {
  at: Date; direction: 'inbound' | 'outbound'; peerName: string | null; capability: string; target: string | null;
  outcome: 'ok' | 'denied' | 'error'; httpStatus: number | null; durationMs: number | null; errorCode: string | null;
}
export interface StatusAgentRow { slug: string; asks: number; failures: number; lastAt: Date | null }

/** Read port; SQL in status.repository.ts, in memory in tests. */
export interface StatusSource {
  load(): Promise<{ running: number; queued: number; asyncRunning: number }>;
  runs(since: Date, limit: number): Promise<StatusRunRow[]>;
  asks(since: Date, limit: number): Promise<StatusAuditRow[]>;
  events(since: Date, limit: number): Promise<StatusAuditRow[]>;
  agentStats(since: Date, limit: number): Promise<StatusAgentRow[]>;
}

export interface StatusUnitInfo {
  name: string; displayName: string | null; emoji: string | null; role: string | null;
  appVersion: string | null; commit: string | null;
}

export interface StatusServiceDeps {
  source: StatusSource;
  unit: () => Promise<StatusUnitInfo>;
  env?: Env;
  now?: () => number;
}

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const CODE = /^[a-z0-9_.:-]{1,64}$/i;
const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null);
const slugOrNull = (value: string | null | undefined) => {
  const lower = value?.trim().toLowerCase() ?? '';
  return SLUG.test(lower) ? lower : null;
};
const codeOrNull = (value: string | null | undefined) => (value && CODE.test(value) ? value : null);
const int = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
};
const text = (value: string | null | undefined, max: number) => (value ? value.slice(0, max) : null);

/** Opaque, stable id: peers never see local row ids. */
export function opaqueId(id: string): string {
  return createHash('sha256').update(`allerac-status:${id}`).digest('hex').slice(0, 16);
}

function runStatus(status: string): StatusRun['status'] {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'planning') return 'queued';
  return 'running';
}

export class StatusService {
  private readonly env: Env;
  private readonly now: () => number;

  constructor(private readonly deps: StatusServiceDeps) {
    this.env = deps.env ?? process.env;
    this.now = deps.now ?? Date.now;
  }

  /** `since` is clamped to the 24h window; `grantedCapabilities` are the caller's (empty for the home itself). */
  async build(options: { since?: Date | null; grantedCapabilities?: string[] } = {}): Promise<FederationStatus> {
    const now = this.now();
    const floor = now - STATUS_WINDOW_MS;
    const since = new Date(Math.max(floor, options.since?.getTime() ?? floor));
    const hide = new Set((envList(this.env, 'ALLERAC_FEDERATION_STATUS_HIDE') ?? []).map(item => item.toLowerCase()));
    const limit = STATUS_MAX_ROWS;
    const { source } = this.deps;
    const [unit, load, runs, asks, events, agents] = await Promise.all([
      this.deps.unit(), source.load(), source.runs(since, limit), source.asks(since, limit),
      source.events(since, limit), source.agentStats(since, limit),
    ]);
    const maxRunning = Number(this.env.FEDERATION_ASYNC_MAX_RUNNING);
    // Inbound targets are chosen by the caller, so only agents this Unit exposes are named.
    const exposed = new Set(exposedAgentSlugs(this.env));
    const localAgent = (value: string | null) => {
      const agent = slugOrNull(value);
      return agent && exposed.has(agent) ? agent : null;
    };

    const status: FederationStatus = {
      version: STATUS_VERSION,
      generated_at: new Date(now).toISOString(),
      unit: {
        name: slugOrNull(unit.name) ?? 'unit',
        display_name: text(unit.displayName, 100),
        emoji: text(unit.emoji, 16),
        role: text(unit.role, 200),
        app_version: text(unit.appVersion, 64),
        commit: text(unit.commit, 64),
      },
      load: {
        runs_running: int(load.running) ?? 0,
        runs_queued: int(load.queued) ?? 0,
        async_asks_running: int(load.asyncRunning) ?? 0,
        async_max_running: Number.isInteger(maxRunning) && maxRunning > 0 ? maxRunning : DEFAULT_ASYNC_MAX_RUNNING,
      },
      agents: agents.flatMap(row => {
        const agent = localAgent(row.slug);
        return agent ? [{ slug: agent, asks_24h: int(row.asks) ?? 0, failures_24h: int(row.failures) ?? 0, last_ask_at: iso(row.lastAt) }] : [];
      }).slice(0, limit),
      runs: runs.slice(0, limit).map((row): StatusRun => ({
        id: opaqueId(String(row.id)),
        status: runStatus(row.status),
        started_at: iso(row.startedAt),
        duration_ms: row.startedAt && row.completedAt
          ? int(new Date(row.completedAt).getTime() - new Date(row.startedAt).getTime()) : null,
        tokens: hide.has('tokens') ? null : int(row.tokens),
        requested_by: 'local',
      })),
      federated_asks: asks.slice(0, limit).map((row): StatusAsk => ({
        at: iso(row.at) as string,
        direction: row.direction,
        peer: slugOrNull(row.peerName),
        agent: row.direction === 'inbound' ? localAgent(row.target) : slugOrNull(row.target),
        outcome: row.outcome,
        http_status: row.httpStatus ?? null,
        duration_ms: int(row.durationMs),
        error_code: codeOrNull(row.errorCode),
      })),
      federation_events: events.slice(0, limit).map((row): StatusEvent => ({
        at: iso(row.at) as string,
        direction: row.direction,
        peer: slugOrNull(row.peerName),
        capability: codeOrNull(row.capability) ?? 'unknown',
        outcome: row.outcome,
        http_status: row.httpStatus ?? null,
        error_code: codeOrNull(row.errorCode),
      })),
      granted_capabilities: (options.grantedCapabilities ?? []).filter(id => CODE.test(id)).slice(0, 20),
      truncated: [runs, asks, events, agents].some(list => list.length >= limit),
    };
    return federationStatusSchema.parse(status);
  }
}
