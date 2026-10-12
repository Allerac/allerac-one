import '../__mocks__/db';
import pool from '@/app/clients/db';
import { requireCurrentUser } from '@/app/lib/auth-session';
import { deleteActivity, disconnectGarmin, getGarminStatus, getRecentActivities } from '@/app/actions/health';

jest.mock('@/app/lib/auth-session', () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock('@/lib/submit-log', () => ({
  submitLog: jest.fn(),
}));

const mockQuery = jest.mocked(pool.query);
const mockRequireCurrentUser = jest.mocked(requireCurrentUser);

// Shared by the describe blocks below: two pool.query calls
// getGarminConnection makes before any activity-specific work — a connected,
// cached-mode Garmin connection.
function queueGarminConnectionQueries() {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ is_connected: true, data_mode: 'cached' }] } as never) // integration_connections
    .mockResolvedValueOnce({ rows: [{ oauth1_token_encrypted: 'plain-session-dump' }] } as never); // garmin_credentials
}

// callHealthWorker just needs res.ok/res.json() — avoid depending on the
// global Response constructor, which isn't available in every jest env.
function fakeFetchJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

describe('Health actions authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue({
      id: 'user-a',
      email: 'a@example.com',
      name: 'User A',
      is_admin: false,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  it('ignores a client-supplied user id and uses the session user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await getGarminStatus();

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_id = $1'),
      ['user-a']
    );
  });
});

describe('Normalized activity upsert (Phase 1)', () => {
  const originalSecret = process.env.HEALTH_WORKER_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HEALTH_WORKER_SECRET = 'test-secret';
    mockRequireCurrentUser.mockResolvedValue({
      id: 'user-a',
      email: 'a@example.com',
      name: 'User A',
      is_admin: false,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  afterAll(() => {
    process.env.HEALTH_WORKER_SECRET = originalSecret;
  });

  it('stores the true unreduced Garmin payload and normalized columns, then enqueues a detail-sync job for a new activity', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never); // cache miss (getActivitiesFromDB)
    queueGarminConnectionQueries();

    const summaryRaw = { marker: 'raw-summary-fixture', timeZoneId: 'Europe/Madrid' };
    global.fetch = jest.fn().mockResolvedValue(fakeFetchJson({
      activities: [{
        activityId: 999,
        activityName: 'Barcelona Morning Run',
        activityType: 'running',
        startTimeLocal: '2026-03-15T07:30:00',
        duration: 2096,
        calories: 320,
        summaryRaw,
        payloadVersion: 1,
        normalized: {
          provider: 'garmin',
          provider_activity_id: '999',
          sport_type: 'running',
          average_pace_seconds_per_km: 419.0,
          training_effect_aerobic: 3.4,
          average_power_watts: 229.0,
        },
      }],
    }) as never);

    mockQuery.mockResolvedValueOnce({ rows: [{ activity_id: '999', inserted: true }] } as never); // INSERT ... ON CONFLICT
    mockQuery.mockResolvedValueOnce({ rows: [] } as never); // enqueue detail-sync job

    await getRecentActivities(10, '2026-03-15');

    const upsertCall = mockQuery.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('INSERT INTO health_activities'));
    expect(upsertCall).toBeDefined();
    const [sql, params] = upsertCall as unknown as [string, unknown[]];
    expect(sql).toContain('average_pace_seconds_per_km');
    expect(params).toEqual(expect.arrayContaining([
      JSON.stringify(summaryRaw),
      'garmin',
      '999',
      'running',
      419.0,
      3.4,
      229.0,
      1, // payload_version
    ]));

    const enqueueCall = mockQuery.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('health_activity_detail_sync_jobs'));
    expect(enqueueCall).toBeDefined();
    expect(enqueueCall?.[1]).toEqual(['user-a', '999']);
  });
});

// Activity detail sync (Phase 2/3) tests moved to
// src/__tests__/services/health/detail-sync.service.test.ts, alongside the
// function itself (src/app/services/health/detail-sync.service.ts).

describe('Activity deletion (Phase 3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue({
      id: 'user-a',
      email: 'a@example.com',
      name: 'User A',
      is_admin: false,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  it('deletes an owned activity (laps/zones/samples cascade via FK)', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 } as never);

    const deleted = await deleteActivity('123');

    expect(deleted).toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM health_activities WHERE user_id = $1 AND activity_id = $2'),
      ['user-a', '123'],
    );
  });

  it('returns false for an activity that does not belong to the session user', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 } as never);

    const deleted = await deleteActivity('someone-elses-activity');

    expect(deleted).toBe(false);
  });

  it('disconnectGarmin never touches health_activities (no silent history deletion)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never) // DELETE garmin_credentials
      .mockResolvedValueOnce({ rows: [] } as never) // DELETE health_mfa_sessions
      .mockResolvedValueOnce({ rows: [] } as never); // clearConnection: DELETE integration_connections

    await disconnectGarmin();

    for (const [sql] of mockQuery.mock.calls) {
      expect(String(sql)).not.toMatch(/health_activities/);
    }
  });
});
