/** @jest-environment node */

import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import pool from '@/app/clients/db';
import { GET as getHealthStatus } from '@/app/api/v1/health/status/route';
import { GET as getHealthSummary } from '@/app/api/v1/health/summary/route';
import { GET as getDailyHealth } from '@/app/api/v1/health/daily/route';
import { GET as listActivities } from '@/app/api/v1/health/activities/route';
import { GET as getActivityDetail, DELETE as deleteActivityRoute } from '@/app/api/v1/health/activities/[activityId]/route';
import { GET as listActivityLaps } from '@/app/api/v1/health/activities/[activityId]/laps/route';
import { GET as listActivityZones } from '@/app/api/v1/health/activities/[activityId]/zones/route';
import { GET as getActivityRoute } from '@/app/api/v1/health/activities/[activityId]/route/route';
import { GET as getActivitySeries } from '@/app/api/v1/health/activities/[activityId]/series/route';
import { POST as syncActivity } from '@/app/api/v1/health/activities/[activityId]/sync/route';
import { PUT as correctExerciseSets } from '@/app/api/v1/health/activities/[activityId]/exercise-sets/route';
import { GET as listProtectedLocationsRoute, POST as addProtectedLocationRoute } from '@/app/api/v1/health/protected-locations/route';
import { DELETE as deleteProtectedLocationRoute } from '@/app/api/v1/health/protected-locations/[id]/route';

jest.mock('@/app/lib/auth-session', () => {
  class MockUnauthorizedError extends Error {}
  class MockForbiddenError extends Error {}
  return {
    UnauthorizedError: MockUnauthorizedError,
    ForbiddenError: MockForbiddenError,
    requireCurrentUser: jest.fn(),
    assertDomainAccess: jest.fn(),
  };
});

jest.mock('@/app/clients/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

jest.mock('@/app/services/crypto/encryption.service', () => ({
  safeDecrypt: jest.fn(() => 'session-dump'),
  encrypt: jest.fn((value: string) => `encrypted:${value}`),
  decrypt: jest.fn((value: string) => value.replace(/^encrypted:/, '')),
}));

const mockRequireCurrentUser = jest.mocked(requireCurrentUser);
const mockPool = pool as jest.Mocked<typeof pool>;

const user = {
  id: 'user-id',
  email: 'user@example.com',
  name: 'User',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

describe('Control API v1 health', () => {
  const originalHealthWorkerSecret = process.env.HEALTH_WORKER_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue(user);
    // Set explicitly rather than relying on whatever .env happens to be
    // loaded — the Garmin-sync tests below need this truthy to reach the
    // mocked fetch() instead of short-circuiting on "not configured".
    process.env.HEALTH_WORKER_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env.HEALTH_WORKER_SECRET = originalHealthWorkerSecret;
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());

    const response = await getHealthStatus(new Request('http://localhost/api/v1/health/status'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: 'unauthorized', message: 'Unauthorized' } });
  });

  it('returns disconnected status when no garmin row found', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] } as any) // garmin_credentials
      .mockResolvedValueOnce({ rows: [] } as any); // integration_connections

    const response = await getHealthStatus(new Request('http://localhost/api/v1/health/status'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toEqual({
      isConnected: false,
      mfaPending: false,
      syncEnabled: false,
      lastSyncAt: null,
      lastError: null,
    });
  });

  it('returns garmin connection status', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ mfa_pending: false }] } as any) // garmin_credentials
      .mockResolvedValueOnce({
        rows: [{
          is_connected: true,
          sync_enabled: true,
          last_sync_at: '2026-06-25T06:00:00.000Z',
          last_error: null,
          data_mode: 'cached',
        }],
      } as any); // integration_connections

    const response = await getHealthStatus(new Request('http://localhost/api/v1/health/status'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toMatchObject({
      isConnected: true,
      syncEnabled: true,
      lastSyncAt: '2026-06-25T06:00:00.000Z',
    });
  });

  it('returns health summary for the requested period', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        avg_steps: 9400,
        avg_calories: 2100,
        avg_resting_hr: 58,
        avg_sleep_hours: 7.2,
        total_steps: 65800,
        total_calories: 14700,
        max_steps: 12000,
        days_with_data: 7,
      }],
    } as any);

    const response = await getHealthSummary(new Request('http://localhost/api/v1/health/summary?period=week'));

    expect(response.status).toBe(200);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('health_daily_metrics'),
      [user.id, expect.any(String)],
    );
    const body = await response.json();
    expect(body.data.summary).toMatchObject({ period: 'week', avg_steps: 9400, days_with_data: 7 });
  });

  it('defaults period to week when not specified', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ days_with_data: 0 }] } as any);

    const response = await getHealthSummary(new Request('http://localhost/api/v1/health/summary'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.summary.period).toBe('week');
  });

  it('returns 400 for invalid period value', async () => {
    const response = await getHealthSummary(new Request('http://localhost/api/v1/health/summary?period=century'));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
  });

  it('returns daily health snapshot', async () => {
    const dailyRow = { date: '2026-06-25', steps: 10234, resting_hr: 57 };
    mockPool.query.mockResolvedValueOnce({ rows: [dailyRow] } as any);

    const response = await getDailyHealth(new Request('http://localhost/api/v1/health/daily?date=2026-06-25'));

    expect(response.status).toBe(200);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('health_daily_metrics'),
      [user.id, '2026-06-25'],
    );
    const body = await response.json();
    expect(body.data.daily).toMatchObject({ date: '2026-06-25', steps: 10234 });
  });

  it('returns null daily data when no row found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] } as any);

    const response = await getDailyHealth(new Request('http://localhost/api/v1/health/daily?date=2026-01-01'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.daily).toBeNull();
  });

  it('returns 400 for invalid date format on daily', async () => {
    const response = await getDailyHealth(new Request('http://localhost/api/v1/health/daily?date=25-06-2026'));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
  });

  it('lists recent activities', async () => {
    const activity = { id: 'act-1', activity_name: 'Morning Run', activity_type: 'running' };
    mockPool.query.mockResolvedValueOnce({ rows: [activity] } as any);

    const response = await listActivities(new Request('http://localhost/api/v1/health/activities?limit=5'));

    expect(response.status).toBe(200);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('health_activities'),
      [user.id, 5],
    );
    const body = await response.json();
    expect(body.data.activities[0]).toMatchObject({ activity_name: 'Morning Run' });
  });

  it('filters activities by date', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] } as any);

    const response = await listActivities(new Request('http://localhost/api/v1/health/activities?date=2026-06-25'));

    expect(response.status).toBe(200);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('date = $2'),
      [user.id, '2026-06-25', 10],
    );
  });

  it('returns one activity detail with normalized fields', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ activity_id: '123', sport_type: 'running', average_pace_seconds_per_km: 419, detail_sync_status: 'complete' }],
    } as any);

    const response = await getActivityDetail(
      new Request('http://localhost/api/v1/health/activities/123'),
      { params: Promise.resolve({ activityId: '123' }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.activity).toMatchObject({ sport_type: 'running', detail_sync_status: 'complete' });
  });

  it('returns 404 for an activity detail that does not belong to the user', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] } as any);

    const response = await getActivityDetail(
      new Request('http://localhost/api/v1/health/activities/999'),
      { params: Promise.resolve({ activityId: '999' }) },
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-numeric activityId on the detail route', async () => {
    const response = await getActivityDetail(
      new Request('http://localhost/api/v1/health/activities/abc'),
      { params: Promise.resolve({ activityId: 'abc' }) },
    );

    expect(response.status).toBe(400);
  });

  // Regression guard: health_activities also holds `raw_data` (Garmin's
  // original list payload) and `provider_details_raw` (the full Phase 2/3
  // detail-sync payload — hundreds of KB, the source of embedded GPS
  // samples). A `SELECT *` here previously leaked both into every list/
  // detail response, contradicting this endpoint's documented contract.
  it('never selects raw provider payload columns for list or detail', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] } as any);
    await listActivities(new Request('http://localhost/api/v1/health/activities'));
    const listQuery = String(mockPool.query.mock.calls.at(-1)?.[0]);
    expect(listQuery).not.toMatch(/select\s+\*/i);
    expect(listQuery).not.toMatch(/raw_data|provider_details_raw/);

    mockPool.query.mockResolvedValueOnce({ rows: [{ activity_id: '123' }] } as any);
    await getActivityDetail(
      new Request('http://localhost/api/v1/health/activities/123'),
      { params: Promise.resolve({ activityId: '123' }) },
    );
    const detailQuery = String(mockPool.query.mock.calls.at(-1)?.[0]);
    expect(detailQuery).not.toMatch(/select\s+\*/i);
    expect(detailQuery).not.toMatch(/raw_data|provider_details_raw/);
  });

  it('lists laps for an owned activity', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ activity_id: '123' }] } as any) // ownership check
      .mockResolvedValueOnce({ rows: [{ lap_index: 1, duration_seconds: 300 }] } as any); // laps

    const response = await listActivityLaps(
      new Request('http://localhost/api/v1/health/activities/123/laps'),
      { params: Promise.resolve({ activityId: '123' }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.laps).toEqual([{ lap_index: 1, duration_seconds: 300 }]);
  });

  it('returns 404 for laps on an activity the user does not own', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] } as any); // ownership check fails

    const response = await listActivityLaps(
      new Request('http://localhost/api/v1/health/activities/123/laps'),
      { params: Promise.resolve({ activityId: '123' }) },
    );

    expect(response.status).toBe(404);
  });

  it('lists zones for an owned activity', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ activity_id: '123' }] } as any) // ownership check
      .mockResolvedValueOnce({ rows: [{ metric_type: 'heart_rate', zone_number: 1, percent: 25 }] } as any); // zones

    const response = await listActivityZones(
      new Request('http://localhost/api/v1/health/activities/123/zones'),
      { params: Promise.resolve({ activityId: '123' }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.zones).toEqual([{ metric_type: 'heart_rate', zone_number: 1, percent: 25 }]);
  });

  it('queues a detail sync job idempotently', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ activity_id: '123' }] } as any) // ownership check
      .mockResolvedValueOnce({ rows: [{ status: 'pending' }] } as any) // job upsert
      .mockResolvedValueOnce({ rows: [] } as any); // health_activities status reset

    const response = await syncActivity(
      new Request('http://localhost/api/v1/health/activities/123/sync', { method: 'POST' }),
      { params: Promise.resolve({ activityId: '123' }) },
    );

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.data).toMatchObject({ activityId: '123', queued: true, jobStatus: 'pending' });
    expect(mockPool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('ON CONFLICT (user_id, activity_id) DO UPDATE'),
      [user.id, '123'],
    );
  });

  it('returns 404 when syncing an activity the user does not own', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] } as any); // ownership check fails

    const response = await syncActivity(
      new Request('http://localhost/api/v1/health/activities/123/sync', { method: 'POST' }),
      { params: Promise.resolve({ activityId: '123' }) },
    );

    expect(response.status).toBe(404);
  });

  it('deletes an owned activity', async () => {
    mockPool.query.mockResolvedValueOnce({ rowCount: 1 } as any);

    const response = await deleteActivityRoute(
      new Request('http://localhost/api/v1/health/activities/123', { method: 'DELETE' }),
      { params: Promise.resolve({ activityId: '123' }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual({ activityId: '123', deleted: true });
  });

  it('returns 404 when deleting an activity the user does not own', async () => {
    mockPool.query.mockResolvedValueOnce({ rowCount: 0 } as any);

    const response = await deleteActivityRoute(
      new Request('http://localhost/api/v1/health/activities/123', { method: 'DELETE' }),
      { params: Promise.resolve({ activityId: '123' }) },
    );

    expect(response.status).toBe(404);
  });

  it('returns route bounds and simplified polyline without detail', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        route_min_lat: 10.0, route_max_lat: 10.001, route_min_lon: 20.0, route_max_lon: 20.001,
        route_simplified_polyline: 'abc123', route_sample_count: 2,
      }],
    } as any);

    const response = await getActivityRoute(
      new Request('http://localhost/api/v1/health/activities/123/route'),
      { params: Promise.resolve({ activityId: '123' }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.simplifiedPolyline).toBe('abc123');
    expect(body.data.coordinates).toBeUndefined();
  });

  it('returns redacted detailed coordinates when detail=true', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{
          route_min_lat: 10.0, route_max_lat: 50.0, route_min_lon: 20.0, route_max_lon: 60.0,
          route_simplified_polyline: 'abc123', route_sample_count: 2,
        }],
      } as any) // activity route bounds
      .mockResolvedValueOnce({
        rows: [
          { sample_index: 0, timestamp: 1000, elapsed_seconds: 0, latitude: '10.0', longitude: '20.0', elevation_meters: 5 },
          { sample_index: 1, timestamp: 2000, elapsed_seconds: 10, latitude: '50.0', longitude: '60.0', elevation_meters: 6 },
        ],
      } as any) // samples
      .mockResolvedValueOnce({
        rows: [{ id: 'zone-1', label: 'Home', location_encrypted: 'encrypted:{"lat":10.0,"lng":20.0}', radius_meters: 100 }],
      } as any); // protected locations

    const response = await getActivityRoute(
      new Request('http://localhost/api/v1/health/activities/123/route?detail=true'),
      { params: Promise.resolve({ activityId: '123' }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.redacted).toBe(true);
    expect(body.data.coordinates).toHaveLength(1);
    expect(body.data.coordinates[0].sample_index).toBe(1);
  });

  it('returns 404 for a route on an activity the user does not own', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] } as any);

    const response = await getActivityRoute(
      new Request('http://localhost/api/v1/health/activities/123/route'),
      { params: Promise.resolve({ activityId: '123' }) },
    );

    expect(response.status).toBe(404);
  });

  it('returns a downsampled series for selected metrics, excluding coordinates', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ activity_id: '123' }] } as any) // ownership check
      .mockResolvedValueOnce({
        rows: [
          { sample_index: 0, elapsed_seconds: 0, latitude: null, longitude: null, heart_rate_bpm: 150 },
          { sample_index: 1, elapsed_seconds: 10, latitude: null, longitude: null, heart_rate_bpm: 158 },
        ],
      } as any) // samples
      .mockResolvedValueOnce({ rows: [] } as any); // protected locations (none)

    const response = await getActivitySeries(
      new Request('http://localhost/api/v1/health/activities/123/series?metrics=heart_rate'),
      { params: Promise.resolve({ activityId: '123' }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.metrics).toEqual(['heart_rate']);
    expect(body.data.points).toHaveLength(2);
    expect(body.data.points[0]).not.toHaveProperty('latitude');
  });

  it('returns 400 for an unknown metric name', async () => {
    const response = await getActivitySeries(
      new Request('http://localhost/api/v1/health/activities/123/series?metrics=bogus'),
      { params: Promise.resolve({ activityId: '123' }) },
    );

    expect(response.status).toBe(400);
  });

  it('returns 404 for series on an activity the user does not own', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] } as any); // ownership check fails

    const response = await getActivitySeries(
      new Request('http://localhost/api/v1/health/activities/123/series'),
      { params: Promise.resolve({ activityId: '123' }) },
    );

    expect(response.status).toBe(404);
  });

  it('lists protected locations, decrypting coordinates', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'zone-1', label: 'Home', location_encrypted: 'encrypted:{"lat":41.38,"lng":2.17}', radius_meters: 200 }],
    } as any);

    const response = await listProtectedLocationsRoute(
      new Request('http://localhost/api/v1/health/protected-locations'),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.locations).toEqual([
      { id: 'zone-1', label: 'Home', lat: 41.38, lng: 2.17, radiusMeters: 200 },
    ]);
  });

  it('adds a protected location', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'zone-2' }] } as any);

    const response = await addProtectedLocationRoute(
      new Request('http://localhost/api/v1/health/protected-locations', {
        method: 'POST',
        body: JSON.stringify({ label: 'Work', lat: 41.4, lng: 2.2, radiusMeters: 100 }),
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.location).toMatchObject({ id: 'zone-2', label: 'Work', lat: 41.4, lng: 2.2, radiusMeters: 100 });
  });

  it('rejects an invalid protected location payload', async () => {
    const response = await addProtectedLocationRoute(
      new Request('http://localhost/api/v1/health/protected-locations', {
        method: 'POST',
        body: JSON.stringify({ lat: 999, lng: 2.2, radiusMeters: 100 }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it('deletes a protected location', async () => {
    mockPool.query.mockResolvedValueOnce({ rowCount: 1 } as any);

    const response = await deleteProtectedLocationRoute(
      new Request('http://localhost/api/v1/health/protected-locations/zone-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'zone-1' }) },
    );

    expect(response.status).toBe(200);
  });

  it('returns 404 when deleting a protected location that does not belong to the user', async () => {
    mockPool.query.mockResolvedValueOnce({ rowCount: 0 } as any);

    const response = await deleteProtectedLocationRoute(
      new Request('http://localhost/api/v1/health/protected-locations/zone-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'zone-1' }) },
    );

    expect(response.status).toBe(404);
  });

  it('keeps the local exercise correction when Garmin accepts it', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ activity_id: '123' }] } as any) // health_activities: save pending
      .mockResolvedValueOnce({ rows: [{ is_connected: true }] } as any) // integration_connections
      .mockResolvedValueOnce({ rows: [{ oauth1_token_encrypted: 'encrypted-session' }] } as any) // garmin_credentials
      .mockResolvedValueOnce({ rows: [] } as any); // health_activities: mark synced
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ exercise_sets: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await correctExerciseSets(
      new Request('http://localhost/api/v1/health/activities/123/exercise-sets', {
        method: 'PUT',
        body: JSON.stringify({
          exerciseSets: [{
            setType: 'ACTIVE',
            repetitionCount: 10,
            weight: 20000,
            exercises: [{ category: 'BENCH_PRESS', name: 'BARBELL_BENCH_PRESS' }],
          }],
        }),
      }),
      { params: Promise.resolve({ activityId: '123' }) },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      localSaved: true,
      garminSyncStatus: 'synced',
    });
    expect(mockPool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("garmin_sync_status = 'pending'"),
      [user.id, '123', expect.any(String)],
    );
  });

  it('keeps the local exercise correction when Garmin rejects it', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ activity_id: '123' }] } as any) // health_activities: save pending
      .mockResolvedValueOnce({ rows: [{ is_connected: true }] } as any) // integration_connections
      .mockResolvedValueOnce({ rows: [{ oauth1_token_encrypted: 'encrypted-session' }] } as any) // garmin_credentials
      .mockResolvedValueOnce({ rows: [] } as any); // health_activities: mark failed
    global.fetch = jest.fn().mockResolvedValue(
      new Response('invalid exercise', { status: 400 }),
    );

    const response = await correctExerciseSets(
      new Request('http://localhost/api/v1/health/activities/123/exercise-sets', {
        method: 'PUT',
        body: JSON.stringify({
          exerciseSets: [{
            setType: 'ACTIVE',
            repetitionCount: 8,
            exercises: [{ category: 'SQUAT', name: 'BACK_SQUAT' }],
          }],
        }),
      }),
      { params: Promise.resolve({ activityId: '123' }) },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      localSaved: true,
      garminSyncStatus: 'garmin_sync_failed',
    });
    expect(mockPool.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("garmin_sync_status = 'garmin_sync_failed'"),
      [user.id, '123', expect.stringContaining('Garmin update failed')],
    );
  });
});
