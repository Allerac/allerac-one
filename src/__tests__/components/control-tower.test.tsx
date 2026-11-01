import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ControlTowerClient from '@/app/admin/control-tower/ControlTowerClient';

jest.mock('@/app/context/ThemeContext', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const NOW = '2026-11-01T18:00:00.000Z';
const overview = {
  generatedAt: NOW, window: '24h',
  units: [
    { id: 'home', isHome: true, name: 'napols', displayName: 'Napols', emoji: '🍕', role: 'Home', state: 'online', limited: false, lastBeatAt: NOW, latencyMs: 0, errorCode: null, appVersion: 'v149', commit: 'd761160aa', load: { runs_running: 1, runs_queued: 0, async_asks_running: 0, async_max_running: 4 }, snapshotAt: NOW, uptime24h: null },
    { id: 'p1', isHome: false, name: 'santos', displayName: 'Santos', emoji: null, role: null, state: 'offline', limited: false, lastBeatAt: '2026-11-01T17:57:00.000Z', latencyMs: null, errorCode: 'peer_unreachable', appVersion: 'v149', commit: null, load: null, snapshotAt: null, uptime24h: { ok: 9, total: 10 } },
    { id: 'p2', isHome: false, name: 'barcelona', displayName: 'Barcelona', emoji: null, role: null, state: 'online', limited: true, lastBeatAt: NOW, latencyMs: 80, errorCode: null, appVersion: null, commit: null, load: null, snapshotAt: null, uptime24h: { ok: 10, total: 10 } },
  ],
  activity: [
    { kind: 'inbox', unit: 'napols', at: NOW, status: 'pending', target: '→ santos/chat', durationMs: null, tokens: null, errorCode: null, threadId: '22222222-2222-4222-8222-222222222222', failed: false, running: true },
    { kind: 'run', unit: 'santos', at: NOW, status: 'failed', target: null, durationMs: 1500, tokens: 12, errorCode: null, threadId: null, failed: true, running: false },
  ],
  events: [{ unit: 'santos', at: NOW, direction: 'inbound', peer: 'napols', capability: 'federation.agents.ask', outcome: 'denied', httpStatus: 429, errorCode: 'rate_limited' }],
  alerts: [{ unitId: 'p1', unit: 'Santos', since: '2026-11-01T17:57:00.000Z', misses: 3 }],
};

describe('Control Tower page (P4d)', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn(async (url: string) => ({
      ok: true, status: 200, json: async () => ({ data: url.includes('/refresh') ? { refreshed: [], throttled: [] } : overview }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('renders units, the offline banner, limited badge, activity with thread link, and events', async () => {
    render(<ControlTowerClient />);
    expect(await screen.findByTestId('offline-alert')).toHaveTextContent('Santos is offline (3 missed heartbeats, last seen 3m ago)');
    expect(screen.getByTestId('unit-card-barcelona')).toContainElement(screen.getByTestId('limited'));
    expect(screen.getByTestId('unit-card-napols')).toHaveTextContent('1 running · 0 queued');
    expect(screen.getByTestId('unit-card-santos')).toHaveTextContent('Uptime 24h90%');
    expect(screen.getAllByTestId('activity-row')).toHaveLength(2);
    expect(screen.getByText('thread').getAttribute('href')).toBe('/chat?inboxThread=22222222-2222-4222-8222-222222222222');
    expect(screen.getByTestId('event-row')).toHaveTextContent('rate_limited');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/control-tower?window=24h&status=all');
  });

  it('applies filters and refreshes on demand', async () => {
    render(<ControlTowerClient />);
    await screen.findByTestId('offline-alert');
    fireEvent.change(screen.getByLabelText('Status filter'), { target: { value: 'failed' } });
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)![0]).toBe('/api/admin/control-tower?window=24h&status=failed'));
    fireEvent.change(screen.getByLabelText('Window'), { target: { value: '1h' } });
    fireEvent.change(screen.getByLabelText('Unit filter'), { target: { value: 'santos' } });
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)![0]).toBe('/api/admin/control-tower?window=1h&status=failed&unit=santos'));
    fireEvent.click(screen.getByText('Refresh now'));
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[0] === '/api/admin/control-tower/refresh')).toBe(true));
  });
});
