/** @jest-environment node */
import { opaqueId, StatusService, type StatusSource } from '@/federation/status.service';
import { federationStatusSchema } from '@/federation/status.schema';

const MARKER = 'SECRET-MARKER-7f3a';
const NOW = Date.parse('2026-11-01T18:00:00Z');

/**
 * A source whose rows also carry content columns (as a careless SELECT * would):
 * prompts, results, titles, user emails. None may reach the payload.
 */
function leakySource(count = 2): StatusSource {
  const leak = { prompt: MARKER, result: MARKER, plan: { text: MARKER }, title: MARKER, content: MARKER, email: `${MARKER}@x.y`, user_id: MARKER };
  return {
    load: async () => ({ running: 1, queued: 2, asyncRunning: 1, ...leak }),
    runs: async () => Array.from({ length: count }, (_, index) => ({
      id: `run-${index}`, status: index ? 'failed' : 'running', startedAt: new Date(NOW - 60_000), completedAt: index ? new Date(NOW) : null,
      tokens: 1534, ...leak,
    })),
    asks: async () => [{
      at: new Date(NOW - 1000), direction: 'inbound' as const, peerName: 'barcelona', capability: 'federation.agents.ask',
      target: 'Chat', outcome: 'ok' as const, httpStatus: 200, durationMs: 900, errorCode: null, ...leak,
    }, {
      at: new Date(NOW - 2000), direction: 'outbound' as const, peerName: 'santos', capability: 'federation.agents.ask',
      target: `${MARKER} tell me`, outcome: 'error' as const, httpStatus: null, durationMs: 60000, errorCode: `${MARKER} free text`, ...leak,
    }],
    events: async () => [{
      at: new Date(NOW - 3000), direction: 'inbound' as const, peerName: 'barcelona', capability: 'federation.agents.ask',
      target: MARKER, outcome: 'denied' as const, httpStatus: 403, errorCode: 'capability_not_granted', ...leak,
    }],
    agentStats: async () => [
      { slug: 'chat', asks: 12, failures: 1, lastAt: new Date(NOW - 1000), ...leak },
      // A caller-chosen target that is not an exposed agent is never named.
      { slug: MARKER.toLowerCase(), asks: 1, failures: 0, lastAt: null },
    ],
  } as unknown as StatusSource;
}

const service = (source: StatusSource, env: Record<string, string> = {}) => new StatusService({
  source,
  unit: async () => ({ name: 'santos', displayName: 'Santos', emoji: '🏖️', role: 'Beach lab', appVersion: 'v149', commit: 'abc1234' }),
  env: { ALLERAC_FEDERATION_AGENTS: 'chat', ...env },
  now: () => NOW,
});

describe('StatusService (P4d)', () => {
  it('never leaks content: a marker planted in every content column never appears', async () => {
    const status = await service(leakySource()).build({ grantedCapabilities: ['federation.status.read'] });
    expect(JSON.stringify(status)).not.toContain(MARKER);
    expect(JSON.stringify(status).toLowerCase()).not.toContain('secret-marker');
  });

  it('returns exactly the allow-listed keys', async () => {
    const status = await service(leakySource()).build();
    expect(Object.keys(status).sort()).toEqual([
      'agents', 'federated_asks', 'federation_events', 'generated_at', 'granted_capabilities', 'load', 'runs', 'truncated', 'unit', 'version',
    ]);
    expect(Object.keys(status.runs[0]).sort()).toEqual(['duration_ms', 'id', 'requested_by', 'started_at', 'status', 'tokens']);
    expect(Object.keys(status.federated_asks[0]).sort()).toEqual(['agent', 'at', 'direction', 'duration_ms', 'error_code', 'http_status', 'outcome', 'peer']);
    expect(Object.keys(status.federation_events[0]).sort()).toEqual(['at', 'capability', 'direction', 'error_code', 'http_status', 'outcome', 'peer']);
    expect(Object.keys(status.load).sort()).toEqual(['async_asks_running', 'async_max_running', 'runs_queued', 'runs_running']);
    expect(Object.keys(status.unit).sort()).toEqual(['app_version', 'commit', 'display_name', 'emoji', 'name', 'role']);
    expect(federationStatusSchema.safeParse(status).success).toBe(true);
  });

  it('maps metadata: opaque ids, lowercased agent slugs, run status and duration', async () => {
    const status = await service(leakySource()).build();
    expect(status.runs[0]).toEqual({ id: opaqueId('run-0'), status: 'running', started_at: '2026-11-01T17:59:00.000Z', duration_ms: null, tokens: 1534, requested_by: 'local' });
    expect(status.runs[1]).toMatchObject({ status: 'failed', duration_ms: 60_000 });
    expect(status.runs[0].id).not.toContain('run-0');
    expect(status.federated_asks[0]).toMatchObject({ peer: 'barcelona', agent: 'chat', outcome: 'ok' });
    expect(status.federated_asks[1]).toMatchObject({ agent: null, error_code: null });
    expect(status.agents).toEqual([{ slug: 'chat', asks_24h: 12, failures_24h: 1, last_ask_at: '2026-11-01T17:59:59.000Z' }]);
    expect(status.load).toEqual({ runs_running: 1, runs_queued: 2, async_asks_running: 1, async_max_running: 4 });
  });

  it('hides tokens on request and clamps since to 24h', async () => {
    const source = leakySource();
    const runs = jest.spyOn(source, 'runs');
    const status = await service(source, { ALLERAC_FEDERATION_STATUS_HIDE: 'tokens' }).build({ since: new Date(0) });
    expect(status.runs.every(run => run.tokens === null)).toBe(true);
    expect(runs.mock.calls[0][0].toISOString()).toBe('2026-10-31T18:00:00.000Z');
    expect(runs.mock.calls[0][1]).toBe(100);
  });

  it('flags truncation at the 100-row cap', async () => {
    const status = await service(leakySource(100)).build();
    expect(status.runs).toHaveLength(100);
    expect(status.truncated).toBe(true);
  });

  it('rejects any payload with an unexpected key on the home side', () => {
    const bad = { version: 1, generated_at: 'x', unit: { name: 'a', display_name: null, emoji: null, role: null, app_version: null, commit: null, prompt: MARKER },
      load: { runs_running: 0, runs_queued: 0, async_asks_running: 0, async_max_running: 4 }, agents: [], runs: [], federated_asks: [],
      federation_events: [], granted_capabilities: [], truncated: false };
    expect(federationStatusSchema.safeParse(bad).success).toBe(false);
  });
});
