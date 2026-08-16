import '../../__mocks__/db';
import pool from '@/app/clients/db';
import { runActivityDetailSync } from '@/app/services/health/detail-sync.service';

jest.mock('@/app/lib/auth-session', () => ({
  requireCurrentUser: jest.fn(),
}));

const mockQuery = jest.mocked(pool.query);
const mockConnect = jest.mocked(pool.connect);

// Two pool.query calls getGarminConnection makes before any activity-specific
// work — a connected, cached-mode Garmin connection.
function queueGarminConnectionQueries() {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ is_connected: true, data_mode: 'cached' }] } as never) // integration_connections
    .mockResolvedValueOnce({ rows: [{ oauth1_token_encrypted: 'plain-session-dump' }] } as never); // garmin_credentials
}

function fakeTransactionClient(): { query: jest.Mock; release: jest.Mock } {
  return { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
}

// callHealthWorker just needs res.ok/res.json() — avoid depending on the
// global Response constructor, which isn't available in every jest env.
function fakeFetchJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

describe('Activity detail sync (Phase 2/3)', () => {
  const originalSecret = process.env.HEALTH_WORKER_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HEALTH_WORKER_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env.HEALTH_WORKER_SECRET = originalSecret;
  });

  it('replaces laps/zones transactionally and marks the activity complete when nothing failed', async () => {
    queueGarminConnectionQueries();
    mockQuery.mockResolvedValueOnce({ rows: [] } as never); // detail_sync_status = 'syncing'

    global.fetch = jest.fn().mockResolvedValue(fakeFetchJson({
      laps: [{ lap_index: 1, duration_seconds: 300, distance_meters: 1000 }],
      zones: [{ metric_type: 'heart_rate', zone_number: 1, percent: 100 }],
      details_raw: { splits: {} },
      errors: {},
    }) as never);

    const client = fakeTransactionClient();
    mockConnect.mockResolvedValueOnce(client as never);

    const result = await runActivityDetailSync('user-a', '123');

    expect(result).toMatchObject({ status: 'complete', laps: 1, zones: 1 });
    const calledSql = client.query.mock.calls.map(([sql]) => sql);
    expect(calledSql[0]).toBe('BEGIN');
    expect(calledSql).toEqual(expect.arrayContaining([
      expect.stringContaining('DELETE FROM health_activity_laps'),
      expect.stringContaining('DELETE FROM health_activity_zones'),
      expect.stringContaining('INSERT INTO health_activity_laps'),
      expect.stringContaining('INSERT INTO health_activity_zones'),
    ]));
    const finalUpdate = client.query.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes("detail_sync_status = $4"));
    expect(finalUpdate?.[1]).toEqual([
      'user-a', '123', JSON.stringify({ splits: {} }), 'complete',
      null, null, null, null, null, null,
    ]);
    expect(calledSql[calledSql.length - 1]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('downgrades to partial when some data came through despite a resource error', async () => {
    queueGarminConnectionQueries();
    mockQuery.mockResolvedValueOnce({ rows: [] } as never); // detail_sync_status = 'syncing'

    global.fetch = jest.fn().mockResolvedValue(fakeFetchJson({
      laps: [{ lap_index: 1, duration_seconds: 300 }],
      zones: [],
      details_raw: {},
      errors: { zones_power: 'no power meter' },
    }) as never);

    const client = fakeTransactionClient();
    mockConnect.mockResolvedValueOnce(client as never);

    const result = await runActivityDetailSync('user-a', '123');

    expect(result.status).toBe('partial');
  });

  it('marks failed when no laps/zones came through and a resource errored', async () => {
    queueGarminConnectionQueries();
    mockQuery.mockResolvedValueOnce({ rows: [] } as never); // detail_sync_status = 'syncing'

    global.fetch = jest.fn().mockResolvedValue(fakeFetchJson({
      laps: [],
      zones: [],
      details_raw: {},
      errors: { laps: 'unavailable', zones_heart_rate: 'unavailable', zones_power: 'unavailable' },
    }) as never);

    const client = fakeTransactionClient();
    mockConnect.mockResolvedValueOnce(client as never);

    const result = await runActivityDetailSync('user-a', '123');

    expect(result.status).toBe('failed');
  });

  it('rolls back the transaction if a lap insert fails', async () => {
    queueGarminConnectionQueries();
    mockQuery.mockResolvedValueOnce({ rows: [] } as never); // detail_sync_status = 'syncing'

    global.fetch = jest.fn().mockResolvedValue(fakeFetchJson({
      laps: [{ lap_index: 1 }],
      zones: [],
      details_raw: {},
      errors: {},
    }) as never);

    const client = fakeTransactionClient();
    client.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('INSERT INTO health_activity_laps')) {
        return Promise.reject(new Error('constraint violation'));
      }
      return Promise.resolve({ rows: [] });
    });
    mockConnect.mockResolvedValueOnce(client as never);

    await expect(runActivityDetailSync('user-a', '123')).rejects.toThrow('constraint violation');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('bulk-inserts samples via UNNEST and stores route bounds/polyline', async () => {
    queueGarminConnectionQueries();
    mockQuery.mockResolvedValueOnce({ rows: [] } as never); // detail_sync_status = 'syncing'

    global.fetch = jest.fn().mockResolvedValue(fakeFetchJson({
      laps: [],
      zones: [],
      samples: [
        { sample_index: 0, timestamp: 1000, elapsed_seconds: 0, latitude: 10.0, longitude: 20.0, heart_rate_bpm: 150 },
        { sample_index: 1, timestamp: 2000, elapsed_seconds: 10, latitude: 10.001, longitude: 20.001, heart_rate_bpm: 158 },
      ],
      route_bounds: { min_lat: 10.0, max_lat: 10.001, min_lon: 20.0, max_lon: 20.001 },
      route_simplified_polyline: 'abc123',
      details_raw: {},
      errors: {},
    }) as never);

    const client = fakeTransactionClient();
    mockConnect.mockResolvedValueOnce(client as never);

    const result = await runActivityDetailSync('user-a', '123');

    expect(result).toMatchObject({ status: 'complete', samples: 2 });

    const bulkInsert = client.query.mock.calls.find(([sql]: [string]) =>
      typeof sql === 'string' && sql.includes('INSERT INTO health_activity_samples'));
    expect(bulkInsert).toBeDefined();
    const [, params] = bulkInsert as [string, unknown[][]];
    // user_id/activity_id/sample_index arrays, one entry per sample
    expect(params[0]).toEqual(['user-a', 'user-a']);
    expect(params[1]).toEqual(['123', '123']);
    expect(params[2]).toEqual([0, 1]);

    const finalUpdate = client.query.mock.calls.find(([sql]: [string]) =>
      typeof sql === 'string' && sql.includes('route_simplified_polyline = $9'));
    expect(finalUpdate?.[1]).toEqual([
      'user-a', '123', JSON.stringify({}), 'complete',
      10.0, 10.001, 20.0, 20.001, 'abc123', 2,
    ]);
  });

  it('skips the bulk insert when there are no samples', async () => {
    queueGarminConnectionQueries();
    mockQuery.mockResolvedValueOnce({ rows: [] } as never); // detail_sync_status = 'syncing'

    global.fetch = jest.fn().mockResolvedValue(fakeFetchJson({
      laps: [], zones: [], samples: [], details_raw: {}, errors: {},
    }) as never);

    const client = fakeTransactionClient();
    mockConnect.mockResolvedValueOnce(client as never);

    await runActivityDetailSync('user-a', '123');

    const bulkInsert = client.query.mock.calls.find(([sql]: [string]) =>
      typeof sql === 'string' && sql.includes('INSERT INTO health_activity_samples'));
    expect(bulkInsert).toBeUndefined();
  });
});
