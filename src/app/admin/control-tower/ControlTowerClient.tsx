'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '@/app/context/ThemeContext';
import type { ActivityFilter, ControlTowerOverview, ControlTowerWindow, UnitCard } from '@/federation/control-tower';

/** P4d: page refresh while the tab is visible (the heartbeat itself runs server-side every 60s). */
export const OVERVIEW_REFRESH_MS = 15_000;

const STATE_DOT: Record<UnitCard['state'], string> = {
  online: 'bg-green-500', degraded: 'bg-amber-500', offline: 'bg-red-500', unknown: 'bg-gray-400',
};

const ago = (iso: string | null, now: number) => {
  if (!iso) return 'never';
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
};
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Control Tower: one view of every paired unit and agent. Metadata only;
 * no prompts or answers are ever shown (or sent to this page).
 */
export default function ControlTowerClient() {
  const { isDark: d } = useTheme();
  const [data, setData] = useState<ControlTowerOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<ControlTowerWindow>('24h');
  const [status, setStatus] = useState<ActivityFilter>('all');
  const [unit, setUnit] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ window: range, status });
    if (unit) params.set('unit', unit);
    try {
      const response = await fetch(`/api/admin/control-tower?${params}`, { cache: 'no-store' });
      const body = await response.json().catch(() => null) as { data?: ControlTowerOverview; error?: { message?: string } } | null;
      if (!response.ok || !body?.data) throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      setData(body.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [range, status, unit]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') void load();
    }, OVERVIEW_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const refresh = async (peerId?: string) => {
    setRefreshing(true);
    try {
      await fetch('/api/admin/control-tower/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(peerId ? { peerId } : {}),
      });
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const now = data ? Date.parse(data.generatedAt) : Date.now();
  const panel = `rounded-lg border p-4 ${d ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-white'}`;
  const muted = d ? 'text-gray-400' : 'text-gray-500';
  const select = `rounded border px-2 py-1 text-sm ${d ? 'border-gray-600 bg-gray-800' : 'border-gray-300 bg-white'}`;

  return (
    <main className={`min-h-screen p-4 sm:p-6 ${d ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="flex-1 text-lg font-semibold">Control Tower</h1>
          <button type="button" onClick={() => void refresh()} disabled={refreshing}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
            {refreshing ? 'Refreshing…' : 'Refresh now'}
          </button>
          <Link href="/admin" className={`text-sm underline ${muted}`}>Admin</Link>
        </header>
        <p className={`text-xs ${muted}`}>Metadata only: no prompts or answers are shown. Remote data is from each unit&apos;s last heartbeat.</p>

        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

        {data?.alerts.map(alert => (
          <div key={alert.unitId} role="alert" data-testid="offline-alert"
            className={`rounded-md border p-3 text-sm ${d ? 'border-red-500/40 bg-red-900/20 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}`}>
            {alert.unit} is offline ({alert.misses} missed heartbeats, last seen {ago(alert.since, now)}).
          </div>
        ))}

        <section aria-label="Units" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.units.map(card => (
            <div key={card.id} className={panel} data-testid={`unit-card-${card.name}`}>
              <div className="flex items-center gap-2">
                <span aria-label={card.state} className={`inline-block h-2.5 w-2.5 rounded-full ${STATE_DOT[card.state]}`} />
                <span className="font-medium">{card.emoji ?? (card.isHome ? '🏠' : '🛰️')} {card.displayName ?? card.name}</span>
                {card.isHome && <span className={`text-[10px] uppercase ${muted}`}>home</span>}
                {card.limited && (
                  <span data-testid="limited" title="This unit has not granted status read; only liveness is shown."
                    className={`rounded px-1.5 text-[10px] uppercase ${d ? 'bg-gray-700' : 'bg-gray-200'}`}>limited</span>
                )}
              </div>
              {card.role && <p className={`mt-1 text-xs ${muted}`}>{card.role}</p>}
              <dl className={`mt-2 grid grid-cols-2 gap-x-2 text-xs ${muted}`}>
                <dt>State</dt><dd>{card.state}{card.errorCode ? ` (${card.errorCode})` : ''}</dd>
                {!card.isHome && <><dt>Last beat</dt><dd>{ago(card.lastBeatAt, now)}{card.latencyMs !== null ? ` · ${card.latencyMs}ms` : ''}</dd></>}
                <dt>Version</dt><dd>{card.appVersion ?? '—'}{card.commit ? ` · ${card.commit.slice(0, 7)}` : ''}</dd>
                {card.load && <><dt>Runs</dt><dd>{card.load.runs_running} running · {card.load.runs_queued} queued</dd></>}
                {card.load && <><dt>Async asks</dt><dd>{card.load.async_asks_running}/{card.load.async_max_running}</dd></>}
                {card.uptime24h && card.uptime24h.total > 0 && (
                  <><dt>Uptime 24h</dt><dd>{Math.round((card.uptime24h.ok / card.uptime24h.total) * 100)}%</dd></>
                )}
              </dl>
              {!card.isHome && (
                <button type="button" onClick={() => void refresh(card.id)} disabled={refreshing} className="mt-2 text-xs underline">
                  Refresh
                </button>
              )}
            </div>
          ))}
        </section>

        <section aria-label="Activity" className={panel}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold">Activity</h2>
            <select aria-label="Unit filter" className={select} value={unit} onChange={event => setUnit(event.target.value)}>
              <option value="">All units</option>
              {data?.units.map(card => <option key={card.id} value={card.name}>{card.displayName ?? card.name}</option>)}
            </select>
            <select aria-label="Status filter" className={select} value={status} onChange={event => setStatus(event.target.value as ActivityFilter)}>
              <option value="all">All</option>
              <option value="running">Running</option>
              <option value="failed">Failed</option>
            </select>
            <select aria-label="Window" className={select} value={range} onChange={event => setRange(event.target.value as ControlTowerWindow)}>
              <option value="1h">Last 1h</option>
              <option value="24h">Last 24h</option>
            </select>
          </div>
          {data && data.activity.length === 0 ? (
            <p className={`text-xs ${muted}`}>No activity in this window.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className={muted}>
                <tr><th className="py-1">Time</th><th>Unit</th><th>Kind</th><th>Target</th><th>Status</th><th>Duration</th><th>Tokens</th><th /></tr>
              </thead>
              <tbody>
                {data?.activity.map((row, index) => (
                  <tr key={`${row.kind}-${row.at}-${index}`} data-testid="activity-row" className={row.failed ? 'text-red-500' : ''}>
                    <td className="py-1">{time(row.at)}</td>
                    <td>{row.unit}</td>
                    <td>{row.kind}</td>
                    <td>{row.target ?? '—'}</td>
                    <td>{row.status}{row.errorCode ? ` (${row.errorCode})` : ''}</td>
                    <td>{row.durationMs !== null ? `${Math.round(row.durationMs / 100) / 10}s` : '—'}</td>
                    <td>{row.tokens ?? '—'}</td>
                    <td>{row.threadId && <Link href={`/chat?inboxThread=${row.threadId}`} className="underline">thread</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section aria-label="Events" className={panel}>
          <h2 className="mb-2 text-sm font-semibold">Federation events</h2>
          {data && data.events.length === 0 ? (
            <p className={`text-xs ${muted}`}>No denials, rate limits or errors in this window.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {data?.events.map((event, index) => (
                <li key={`${event.at}-${index}`} data-testid="event-row">
                  <span className={muted}>{time(event.at)}</span> · {event.unit} {event.direction === 'inbound' ? '←' : '→'} {event.peer ?? '?'} ·{' '}
                  {event.capability} · {event.outcome}{event.httpStatus ? ` ${event.httpStatus}` : ''}{event.errorCode ? ` (${event.errorCode})` : ''}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
