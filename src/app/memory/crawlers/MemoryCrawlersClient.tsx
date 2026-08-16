'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as crawlerActions from '@/app/actions/crawler';
import { useTheme } from '@/app/context/ThemeContext';

type Dashboard = Awaited<ReturnType<typeof crawlerActions.getCrawlerDashboard>>;
type CrawlerRun = Dashboard['runs'][number];

const ACTIVE_STATUSES = new Set(['pending', 'claimed', 'crawling', 'delivering']);

function statusStyle(status: string, dark: boolean) {
  if (status === 'completed') return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
  if (status === 'failed') return 'bg-red-500/15 text-red-500 border-red-500/30';
  if (status === 'cancelled') return 'bg-slate-500/15 text-slate-500 border-slate-500/30';
  return dark
    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
    : 'bg-cyan-50 text-cyan-700 border-cyan-200';
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

export default function MemoryCrawlersClient() {
  const { isDark } = useTheme();
  const [dashboard, setDashboard] = useState<Dashboard>({ sources: [], runs: [] });
  const [sourceId, setSourceId] = useState('');
  const [maxPages, setMaxPages] = useState('3');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await crawlerActions.getCrawlerDashboard();
      setDashboard(data);
      setSourceId(current => current || data.sources.find(source => source.enabled)?.id || '');
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load crawlers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const hasActiveRuns = useMemo(
    () => dashboard.runs.some(run => ACTIVE_STATUSES.has(run.status)),
    [dashboard.runs],
  );
  useEffect(() => {
    if (!hasActiveRuns) return;
    const timer = window.setInterval(load, 2500);
    return () => window.clearInterval(timer);
  }, [hasActiveRuns, load]);

  const start = async () => {
    setStarting(true);
    setError('');
    try {
      const parsedMaxPages = maxPages.trim() ? Number(maxPages) : null;
      await crawlerActions.startCrawlerRun(sourceId, parsedMaxPages);
      await load();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Failed to start crawl');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className={`h-full overflow-y-auto ${isDark ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Knowledge · Crawlers</h1>
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Start acquisitions and follow delivery into your knowledge base.
            </p>
          </div>
          <nav className="flex gap-2">
            <Link href="/memory/documents" className="rounded-lg border border-indigo-500/30 px-3 py-2 text-sm text-indigo-500">
              Documents
            </Link>
            <Link href="/memory" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700">
              Back to Knowledge
            </Link>
          </nav>
        </header>

        {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{error}</div>}

        <section className={`rounded-xl border p-5 ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
          <h2 className="font-medium">Start a crawl</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
            <label className="text-xs text-gray-500">
              Source
              <select value={sourceId} onChange={event => setSourceId(event.target.value)}
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${
                  isDark ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-300 bg-white'
                }`}>
                {dashboard.sources.map(source => (
                  <option key={source.id} value={source.id} disabled={!source.enabled}>
                    {source.name}{source.enabled ? '' : ' (disabled)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              Max pages
              <input type="number" min={1} max={10000} value={maxPages}
                onChange={event => setMaxPages(event.target.value)}
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${
                  isDark ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-300 bg-white'
                }`} />
            </label>
            <button onClick={start} disabled={!sourceId || starting}
              className="self-end rounded-lg bg-cyan-600 px-5 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
              {starting ? 'Starting…' : 'Start crawl'}
            </button>
          </div>
          {!loading && dashboard.sources.length === 0 && (
            <p className="mt-3 text-sm text-amber-500">No crawler sources are configured for this user.</p>
          )}
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Recent runs</h2>
            <button onClick={load} className="text-xs text-cyan-500 hover:underline">Refresh</button>
          </div>
          {loading ? (
            <p className="text-sm text-gray-500">Loading crawler activity…</p>
          ) : dashboard.runs.length === 0 ? (
            <p className="text-sm text-gray-500">No crawl has been requested yet.</p>
          ) : (
            <div className="space-y-3">
              {dashboard.runs.map(run => <RunCard key={run.id} run={run} isDark={isDark} />)}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function RunCard({ run, isDark }: { run: CrawlerRun; isDark: boolean }) {
  const [showDiagnostics, setShowDiagnostics] = useState(run.status === 'failed');
  return (
    <article className={`rounded-xl border p-4 ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{run.sourceName}</h3>
          <p className="mt-0.5 font-mono text-[10px] text-gray-500">{run.id}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${statusStyle(run.status, isDark)}`}>
          {run.status}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">
        <div>
          <dt className="text-gray-500">HTTP responses</dt>
          <dd>{run.pagesCrawled}{run.maxPages ? ` / ${run.maxPages} page cap` : ''}</dd>
        </div>
        <div><dt className="text-gray-500">Items</dt><dd>{run.itemsScraped}</dd></div>
        <div><dt className="text-gray-500">Requested</dt><dd>{formatDate(run.createdAt)}</dd></div>
        <div><dt className="text-gray-500">Started</dt><dd>{formatDate(run.startedAt)}</dd></div>
        <div><dt className="text-gray-500">Completed</dt><dd>{formatDate(run.completedAt)}</dd></div>
      </dl>
      {run.error && <p className="mt-3 rounded bg-red-500/10 p-2 text-xs text-red-500">{run.error}</p>}
      <button
        type="button"
        onClick={() => setShowDiagnostics(current => !current)}
        className="mt-3 text-xs text-cyan-500 hover:underline"
      >
        {showDiagnostics ? 'Hide diagnostics' : `Show diagnostics (${run.events.length})`}
      </button>
      {showDiagnostics && (
        <div className={`mt-3 rounded-lg border p-3 ${
          isDark ? 'border-gray-700 bg-gray-950/50' : 'border-gray-200 bg-gray-50'
        }`}>
          <div className="grid gap-2 text-[11px] sm:grid-cols-3">
            <div><span className="text-gray-500">Worker</span><p className="font-mono">{run.workerId || 'Not claimed'}</p></div>
            <div><span className="text-gray-500">Checkpoint</span><p className="break-all font-mono">{run.checkpoint || 'None'}</p></div>
            <div><span className="text-gray-500">Last update</span><p>{formatDate(run.updatedAt)}</p></div>
          </div>
          <h4 className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Event timeline</h4>
          {run.events.length === 0 ? (
            <p className="mt-2 text-xs text-gray-500">No structured events were recorded.</p>
          ) : (
            <ol className="mt-2 space-y-2">
              {run.events.map((event, index) => (
                <li key={`${event.createdAt}-${event.code}-${index}`}
                  className={`border-l-2 pl-3 text-xs ${
                    event.level === 'error' ? 'border-red-500' : event.level === 'warning' ? 'border-amber-500' : 'border-cyan-500'
                  }`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <time className="text-gray-500">{formatDate(event.createdAt)}</time>
                    <code className="rounded bg-gray-500/10 px-1.5 py-0.5">{event.code}</code>
                  </div>
                  <p className="mt-1">{event.message}</p>
                  {Object.keys(event.details).length > 0 && (
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded bg-black/20 p-2 text-[10px] text-gray-400">
                      {JSON.stringify(event.details, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-[10px] text-gray-500">
            HTTP responses may include robots.txt and redirects, so this number can exceed the requested page cap.
          </p>
        </div>
      )}
      {run.status === 'completed' && (
        <Link href="/memory/documents" className="mt-3 inline-block text-xs text-indigo-500 hover:underline">
          View knowledge documents →
        </Link>
      )}
    </article>
  );
}
