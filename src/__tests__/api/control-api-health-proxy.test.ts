/** @jest-environment node */

import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import pool from '@/app/clients/db';
import { GET as getProxyStatus } from '@/app/api/v1/health/proxy/status/route';
import { GET as getProxyActivities } from '@/app/api/v1/health/proxy/activities/route';
import { GET as getProxyActivityDetail } from '@/app/api/v1/health/proxy/activities/[activityId]/route';
import { GET as getProxyActivityLaps } from '@/app/api/v1/health/proxy/activities/[activityId]/laps/route';
import { GET as getProxyActivityZones } from '@/app/api/v1/health/proxy/activities/[activityId]/zones/route';
import { GET as getProxyActivityRoute } from '@/app/api/v1/health/proxy/activities/[activityId]/route/route';
import { GET as getProxyActivitySeries } from '@/app/api/v1/health/proxy/activities/[activityId]/series/route';
import { GET as getProxyDaily } from '@/app/api/v1/health/proxy/daily/route';

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
  safeDecrypt: jest.fn(() => 'decrypted-session-dump'),
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

describe('Control API v1 health proxy', () => {
  const originalHealthWorkerSecret = process.env.HEALTH_WORKER_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue(user);
    process.env.HEALTH_WORKER_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env.HEALTH_WORKER_SECRET = originalHealthWorkerSecret;
  });

  describe('GET /proxy/status', () => {
    it('returns 401 when unauthenticated', async () => {
      mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());

      const response = await getProxyStatus(new Request('http://localhost/api/v1/health/proxy/status'));

      expect(response.status).toBe(401);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('reports disconnected with no-store caching and proxy metadata', async () => {
      // queryGarminStatus reads garmin_credentials (mfa_pending) and
      // integration_connections (everything else) in parallel.
      mockPool.query
        .mockResolvedValueOnce({ rows: [] } as any) // garmin_credentials
        .mockResolvedValueOnce({ rows: [] } as any); // integration_connections

      const response = await getProxyStatus(new Request('http://localhost/api/v1/health/proxy/status'));

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const body = await response.json();
      expect(body.data.status).toMatchObject({ isConnected: false });
      expect(body.data.meta).toMatchObject({ connector: 'garmin', dataMode: 'proxy', stored: false });
    });

    it('reports connected status', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ mfa_pending: false }] } as any) // garmin_credentials
        .mockResolvedValueOnce({
          rows: [{ is_connected: true, sync_enabled: true, last_sync_at: null, last_error: null, data_mode: 'proxy' }],
        } as any); // integration_connections

      const response = await getProxyStatus(new Request('http://localhost/api/v1/health/proxy/status'));

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.status).toMatchObject({ isConnected: true, syncEnabled: true });
    });
  });

  describe('GET /proxy/activities', () => {
    it('returns 400 when date is missing', async () => {
      const response = await getProxyActivities(new Request('http://localhost/api/v1/health/proxy/activities'));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('returns 409 when garmin is not connected', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] } as any); // integration_connections: no row

      const response = await getProxyActivities(
        new Request('http://localhost/api/v1/health/proxy/activities?date=2026-06-25'),
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: 'garmin_not_connected' } });
    });

    it('fetches activities live from the worker and never touches health_activities', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ is_connected: true }] } as any) // integration_connections
        .mockResolvedValueOnce({ rows: [{ oauth1_token_encrypted: 'encrypted' }] } as any); // garmin_credentials
      const fetchMock = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ activities: [{ activityId: '1', activityName: 'Morning Run' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      global.fetch = fetchMock;

      const response = await getProxyActivities(
        new Request('http://localhost/api/v1/health/proxy/activities?date=2026-06-25&limit=5'),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const body = await response.json();
      expect(body.data.activities).toEqual([{ activityId: '1', activityName: 'Morning Run' }]);
      expect(body.data.meta).toMatchObject({ dataMode: 'proxy', stored: false });

      // Two reads (integration_connections, then garmin_credentials) and
      // nothing else — no INSERT/UPDATE into health_activities.
      expect(mockPool.query).toHaveBeenCalledTimes(2);
      expect(mockPool.query).toHaveBeenNthCalledWith(1, expect.stringContaining('integration_connections'), [user.id, 'garmin']);
      expect(mockPool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('garmin_credentials'), [user.id]);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/activities'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ session_dump: 'decrypted-session-dump', date: '2026-06-25', limit: 5 }),
        }),
      );
    });
  });

  describe('GET /proxy/activities/:id', () => {
    it('returns 400 for a non-numeric activityId', async () => {
      const response = await getProxyActivityDetail(
        new Request('http://localhost/api/v1/health/proxy/activities/abc'),
        { params: Promise.resolve({ activityId: 'abc' }) },
      );

      expect(response.status).toBe(400);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('returns 409 when garmin is not connected', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] } as any); // integration_connections

      const response = await getProxyActivityDetail(
        new Request('http://localhost/api/v1/health/proxy/activities/123'),
        { params: Promise.resolve({ activityId: '123' }) },
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: 'garmin_not_connected' } });
    });

    it('returns the worker\'s raw activity-details payload unmodified, including details_raw', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ is_connected: true }] } as any) // integration_connections
        .mockResolvedValueOnce({ rows: [{ oauth1_token_encrypted: 'encrypted' }] } as any); // garmin_credentials
      const workerPayload = {
        laps: [{ lapIndex: 1 }],
        zones: [{ zoneNumber: 1 }],
        samples: [{ sampleIndex: 0, latitude: 10.0, longitude: 20.0 }],
        route_bounds: { minLat: 10.0, maxLat: 10.01 },
        route_simplified_polyline: '_p~iF~ps|U',
        details_raw: { anything: 'the complete unreduced Garmin payload', nested: { field: 1 } },
        errors: {},
        payload_version: 1,
      };
      const fetchMock = jest.fn().mockResolvedValue(
        new Response(JSON.stringify(workerPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
      global.fetch = fetchMock;

      const response = await getProxyActivityDetail(
        new Request('http://localhost/api/v1/health/proxy/activities/123'),
        { params: Promise.resolve({ activityId: '123' }) },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const body = await response.json();
      // The whole worker payload passes through untouched — no column
      // whitelist, no redaction — unlike the cached /activities/:id route.
      expect(body.data).toMatchObject(workerPayload);
      expect(body.data.meta).toMatchObject({ dataMode: 'proxy', stored: false });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/activity-details'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ session_dump: 'decrypted-session-dump', activity_id: '123' }),
        }),
      );
    });
  });

  // laps/zones/route/series each mirror the cached API's endpoint shape but
  // make their own independent live /activity-details call and slice a
  // different piece of the same raw response — no sharing/caching between
  // them, consistent with every other proxy endpoint.
  describe('GET /proxy/activities/:id/laps, /zones, /route, /series', () => {
    const workerPayload = {
      laps: [{ lapIndex: 1 }],
      zones: [{ zoneNumber: 1 }],
      samples: [{ sampleIndex: 0, latitude: 10.0, longitude: 20.0, heartRate: 150 }],
      route_bounds: { minLat: 10.0, maxLat: 10.01 },
      route_simplified_polyline: '_p~iF~ps|U',
      details_raw: { activity_details: {} },
      errors: {},
      payload_version: 1,
    };

    function mockConnectedWorkerFetch() {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ is_connected: true }] } as any)
        .mockResolvedValueOnce({ rows: [{ oauth1_token_encrypted: 'encrypted' }] } as any);
      global.fetch = jest.fn().mockResolvedValue(
        new Response(JSON.stringify(workerPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
    }

    it('laps: slices just the laps array', async () => {
      mockConnectedWorkerFetch();
      const response = await getProxyActivityLaps(
        new Request('http://localhost/api/v1/health/proxy/activities/123/laps'),
        { params: Promise.resolve({ activityId: '123' }) },
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.laps).toEqual(workerPayload.laps);
      expect(body.data.zones).toBeUndefined();
    });

    it('zones: slices just the zones array', async () => {
      mockConnectedWorkerFetch();
      const response = await getProxyActivityZones(
        new Request('http://localhost/api/v1/health/proxy/activities/123/zones'),
        { params: Promise.resolve({ activityId: '123' }) },
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.zones).toEqual(workerPayload.zones);
    });

    it('route: includes bounds, polyline, and unredacted GPS samples', async () => {
      mockConnectedWorkerFetch();
      const response = await getProxyActivityRoute(
        new Request('http://localhost/api/v1/health/proxy/activities/123/route'),
        { params: Promise.resolve({ activityId: '123' }) },
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.route_bounds).toEqual(workerPayload.route_bounds);
      expect(body.data.route_simplified_polyline).toBe(workerPayload.route_simplified_polyline);
      expect(body.data.samples).toEqual(workerPayload.samples);
    });

    it('series: returns the same raw samples array as /route (no GPS/metric split in raw mode)', async () => {
      mockConnectedWorkerFetch();
      const response = await getProxyActivitySeries(
        new Request('http://localhost/api/v1/health/proxy/activities/123/series'),
        { params: Promise.resolve({ activityId: '123' }) },
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.samples).toEqual(workerPayload.samples);
    });

    it('returns 409 when garmin is not connected (laps)', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] } as any);
      const response = await getProxyActivityLaps(
        new Request('http://localhost/api/v1/health/proxy/activities/123/laps'),
        { params: Promise.resolve({ activityId: '123' }) },
      );
      expect(response.status).toBe(409);
    });

    it('returns 400 for a non-numeric activityId (route)', async () => {
      const response = await getProxyActivityRoute(
        new Request('http://localhost/api/v1/health/proxy/activities/abc/route'),
        { params: Promise.resolve({ activityId: 'abc' }) },
      );
      expect(response.status).toBe(400);
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  describe('GET /proxy/daily', () => {
    it('returns 400 when date is missing', async () => {
      const response = await getProxyDaily(new Request('http://localhost/api/v1/health/proxy/daily'));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
    });

    it('returns 409 when garmin is not connected', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ is_connected: false }] } as any); // integration_connections

      const response = await getProxyDaily(
        new Request('http://localhost/api/v1/health/proxy/daily?date=2026-06-25'),
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: 'garmin_not_connected' } });
    });

    it('fetches daily metrics live from the worker and never touches health_daily_metrics', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ is_connected: true }] } as any) // integration_connections
        .mockResolvedValueOnce({ rows: [{ oauth1_token_encrypted: 'encrypted' }] } as any); // garmin_credentials
      const fetchMock = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ steps: 10234, resting_hr: 57 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      global.fetch = fetchMock;

      const response = await getProxyDaily(
        new Request('http://localhost/api/v1/health/proxy/daily?date=2026-06-25'),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const body = await response.json();
      expect(body.data.daily).toEqual({ steps: 10234, resting_hr: 57 });
      expect(body.data.meta).toMatchObject({ dataMode: 'proxy', stored: false });
      expect(mockPool.query).toHaveBeenCalledTimes(2);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/daily-health'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ session_dump: 'decrypted-session-dump', date: '2026-06-25' }),
        }),
      );
    });
  });
});
