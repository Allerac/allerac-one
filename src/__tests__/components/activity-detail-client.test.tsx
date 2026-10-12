import { render, screen } from '@testing-library/react';
import ActivityDetailClient from '@/app/components/health/ActivityDetailClient';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/app/context/ThemeContext', () => ({
  useTheme: () => ({ isDark: false, toggleDark: jest.fn() }),
}));

// Leaflet needs real DOM measurement APIs jsdom doesn't provide — stub the
// map entirely, matching how DocumentUpload-style tests stub heavy
// dependencies rather than exercising them.
jest.mock('@/app/components/health/ActivityRouteMap', () => ({
  __esModule: true,
  default: () => <div data-testid="route-map-stub" />,
}));

const baseActivity = {
  activity_id: '123',
  activity_name: 'Morning Run',
  activity_type: 'running',
  date: '2026-06-25',
  start_time_seconds: 1750000000,
  duration_seconds: 1800,
  calories: 320,
  distance_meters: 5000,
  avg_heart_rate: 150,
  max_heart_rate: 172,
  elevation_gain: 40,
  average_pace_seconds_per_km: 360,
  average_power_watts: null,
  detail_sync_status: 'complete',
};

// Avoid the global Response/fetch constructors — not polyfilled in this
// jsdom test environment. A plain { ok, status, json() } object is all
// ActivityDetailClient's fetchJson helper actually reads.
interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

function notFoundResponse(): FakeResponse {
  return { ok: false, status: 404, json: async () => ({}) };
}

function errorResponse(status = 500): FakeResponse {
  return { ok: false, status, json: async () => ({}) };
}

function jsonResponse(data: unknown, status = 200): FakeResponse {
  return { ok: true, status, json: async () => ({ data }) };
}

function mockFetchSequence(handlers: Record<string, () => FakeResponse>) {
  global.fetch = jest.fn((url: string) => {
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) return Promise.resolve(handler());
    }
    return Promise.resolve(errorResponse());
  }) as unknown as typeof fetch;
}

describe('ActivityDetailClient', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows a loading state, then the loaded activity summary', async () => {
    mockFetchSequence({
      '/laps': () => jsonResponse({ activityId: '123', laps: [] }),
      '/zones': () => jsonResponse({ activityId: '123', zones: [] }),
      '/route': () => jsonResponse({ activityId: '123', bounds: {}, coordinates: [], redacted: false }),
      '/series': () => jsonResponse({ activityId: '123', metrics: [], points: [] }),
      '/api/v1/health/activities/123': () => jsonResponse({ activity: baseActivity }),
    });

    render(<ActivityDetailClient activityId="123" />);

    expect(await screen.findByText('Morning Run')).toBeInTheDocument();
    expect(screen.getByText(/5\.00 km/)).toBeInTheDocument();
  });

  it('shows a not-found state for a 404', async () => {
    mockFetchSequence({
      '/api/v1/health/activities/123': () => notFoundResponse(),
    });

    render(<ActivityDetailClient activityId="123" />);

    expect(await screen.findByText('activityNotFound')).toBeInTheDocument();
  });

  it('shows an error state with retry on a server failure', async () => {
    mockFetchSequence({
      '/api/v1/health/activities/123': () => errorResponse(500),
    });

    render(<ActivityDetailClient activityId="123" />);

    expect(await screen.findByText(/errorLoadingActivity/)).toBeInTheDocument();
    expect(screen.getByText('retry')).toBeInTheDocument();
  });

  it('shows the degraded-state banner and skips route/series fetches when details are still pending', async () => {
    const fetchMock = jest.fn((url: string) => {
      if (url.includes('/api/v1/health/activities/123') && !url.includes('/laps') && !url.includes('/zones')) {
        return Promise.resolve(jsonResponse({ activity: { ...baseActivity, detail_sync_status: 'pending' } }));
      }
      if (url.includes('/laps')) return Promise.resolve(jsonResponse({ activityId: '123', laps: [] }));
      if (url.includes('/zones')) return Promise.resolve(jsonResponse({ activityId: '123', zones: [] }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ActivityDetailClient activityId="123" />);

    expect(await screen.findByText('detailSyncPending')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/route'))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/series'))).toBe(false);
  });

  it('renders the map and charts sections when route/series have data', async () => {
    mockFetchSequence({
      '/laps': () => jsonResponse({ activityId: '123', laps: [] }),
      '/zones': () => jsonResponse({ activityId: '123', zones: [] }),
      '/route': () => jsonResponse({
        activityId: '123',
        bounds: { minLat: 10, maxLat: 10.01, minLon: 20, maxLon: 20.01 },
        coordinates: [{ sample_index: 0, latitude: 10, longitude: 20 }],
        redacted: false,
      }),
      '/series': () => jsonResponse({
        activityId: '123',
        metrics: ['heart_rate'],
        points: [{ sample_index: 0, elapsed_seconds: 0, heart_rate_bpm: 150 }],
      }),
      '/api/v1/health/activities/123': () => jsonResponse({ activity: baseActivity }),
    });

    render(<ActivityDetailClient activityId="123" />);

    expect(await screen.findByTestId('route-map-stub')).toBeInTheDocument();
  });

  it('does not render a delete button — activities are never deletable from this page', async () => {
    mockFetchSequence({
      '/laps': () => jsonResponse({ activityId: '123', laps: [] }),
      '/zones': () => jsonResponse({ activityId: '123', zones: [] }),
      '/route': () => jsonResponse({ activityId: '123', bounds: {}, coordinates: [], redacted: false }),
      '/series': () => jsonResponse({ activityId: '123', metrics: [], points: [] }),
      '/api/v1/health/activities/123': () => jsonResponse({ activity: baseActivity }),
    });

    render(<ActivityDetailClient activityId="123" />);
    await screen.findByText('Morning Run');

    expect(screen.queryByText('deleteActivity')).not.toBeInTheDocument();
  });
});
