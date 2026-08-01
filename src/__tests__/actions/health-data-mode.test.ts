/** @jest-environment node */

import '../__mocks__/db';
import pool from '@/app/clients/db';
import { requireCurrentUser } from '@/app/lib/auth-session';
import {
  connectGarmin,
  getActivitiesRange,
  getHealthMetrics,
  getHealthSummary,
  triggerHealthSync,
} from '@/app/actions/health';

jest.mock('@/app/lib/auth-session', () => ({ requireCurrentUser: jest.fn() }));
jest.mock('@/lib/submit-log', () => ({ submitLog: jest.fn() }));
jest.mock('@/app/services/crypto/encryption.service', () => ({
  encrypt: jest.fn((v: string) => `enc:${v}`),
  safeDecrypt: jest.fn(() => 'decrypted-session-dump'),
}));

const mockQuery = jest.mocked(pool.query);
const mockRequireCurrentUser = jest.mocked(requireCurrentUser);

const user = {
  id: 'user-a',
  email: 'a@example.com',
  name: 'User A',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

function calledWith(needle: string): boolean {
  return mockQuery.mock.calls.some(([sql]) => String(sql).includes(needle));
}

// Routes pool.query by matching a distinctive substring from each SQL
// statement — avoids depending on call order or exact whitespace.
function mockQueriesByNeedle(rowsByNeedle: Record<string, any[]>) {
  mockQuery.mockImplementation(((sql: string) => {
    for (const [needle, rows] of Object.entries(rowsByNeedle)) {
      if (sql.includes(needle)) return Promise.resolve({ rows } as never);
    }
    return Promise.resolve({ rows: [] } as never);
  }) as typeof pool.query);
}

function connectionRow(dataMode: 'cached' | 'proxy') {
  return { is_connected: true, data_mode: dataMode, sync_enabled: true, last_sync_at: null, last_error: null };
}

describe('Health actions — data_mode gating', () => {
  const originalSecret = process.env.HEALTH_WORKER_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue(user);
    process.env.HEALTH_WORKER_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env.HEALTH_WORKER_SECRET = originalSecret;
  });

  it('getHealthMetrics saves fetched metrics for a cached-mode connection', async () => {
    mockQueriesByNeedle({
      'FROM health_daily_metrics': [],
      'FROM integration_connections': [connectionRow('cached')],
      'FROM garmin_credentials': [{ oauth1_token_encrypted: 'enc' }],
    });
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ metrics: [{ date: '2026-06-25', steps: 100 }] }), { status: 200 }),
    );

    const result = await getHealthMetrics('2026-06-25', '2026-06-25');

    expect(calledWith('INSERT INTO health_daily_metrics')).toBe(true);
    expect(result[0]).toMatchObject({ steps: 100 });
  });

  it('getHealthMetrics never fetches or persists for a proxy-mode connection', async () => {
    mockQueriesByNeedle({
      'FROM health_daily_metrics': [],
      'FROM integration_connections': [connectionRow('proxy')],
      'FROM garmin_credentials': [{ oauth1_token_encrypted: 'enc' }],
    });
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    const result = await getHealthMetrics('2026-06-25', '2026-06-25');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(calledWith('INSERT INTO health_daily_metrics')).toBe(false);
    expect(result).toEqual([]);
  });

  it('getActivitiesRange saves fetched activities for a cached-mode connection', async () => {
    mockQueriesByNeedle({
      'FROM health_activities': [],
      'FROM integration_connections': [connectionRow('cached')],
      'FROM garmin_credentials': [{ oauth1_token_encrypted: 'enc' }],
    });
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ activities: [{ activityId: '1' }] }), { status: 200 }),
    );

    await getActivitiesRange('2026-06-25', '2026-06-25');

    expect(calledWith('INSERT INTO health_activities')).toBe(true);
  });

  it('getActivitiesRange never fetches or persists for a proxy-mode connection', async () => {
    mockQueriesByNeedle({
      'FROM health_activities': [],
      'FROM integration_connections': [connectionRow('proxy')],
      'FROM garmin_credentials': [{ oauth1_token_encrypted: 'enc' }],
    });
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    const result = await getActivitiesRange('2026-06-25', '2026-06-25');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(calledWith('INSERT INTO health_activities')).toBe(false);
    expect(result.activities).toEqual([]);
  });

  it('triggerHealthSync refuses to run for a proxy-mode connection', async () => {
    mockQueriesByNeedle({
      'FROM integration_connections': [connectionRow('proxy')],
      'FROM garmin_credentials': [{ oauth1_token_encrypted: 'enc' }],
    });

    await expect(triggerHealthSync(2)).rejects.toThrow(/live\/proxy mode/);
    expect(calledWith('INSERT INTO health_sync_jobs')).toBe(false);
  });

  it('getHealthSummary reports unavailable for a proxy-mode connection instead of an empty summary', async () => {
    mockQueriesByNeedle({
      'FROM integration_connections': [connectionRow('proxy')],
      'FROM garmin_credentials': [{ oauth1_token_encrypted: 'enc' }],
    });

    const result = await getHealthSummary('week');

    expect(result).toEqual({ period: 'week', unavailable: true, reason: 'proxy_mode' });
    expect(calledWith('AVG(steps)')).toBe(false);
  });

  it('connectGarmin persists the chosen data_mode on first connect', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', session_dump: 'dump' }), { status: 200 }),
    );

    await connectGarmin('user@example.com', 'password', 'proxy');

    const upsertCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO integration_connections'));
    expect(upsertCall?.[1]).toContain('proxy');
  });
});
