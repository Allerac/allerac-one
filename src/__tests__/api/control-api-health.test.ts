/** @jest-environment node */

import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import pool from '@/app/clients/db';
import { GET as getHealthStatus } from '@/app/api/v1/health/status/route';
import { GET as getHealthSummary } from '@/app/api/v1/health/summary/route';
import { GET as getDailyHealth } from '@/app/api/v1/health/daily/route';
import { GET as listActivities } from '@/app/api/v1/health/activities/route';

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
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue(user);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());

    const response = await getHealthStatus(new Request('http://localhost/api/v1/health/status'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: 'unauthorized', message: 'Unauthorized' } });
  });

  it('returns disconnected status when no garmin row found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] } as any);

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
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        is_connected: true,
        mfa_pending: false,
        sync_enabled: true,
        last_sync_at: '2026-06-25T06:00:00.000Z',
        last_error: null,
      }],
    } as any);

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
});
