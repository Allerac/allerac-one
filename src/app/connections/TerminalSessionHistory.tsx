'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { TERMINAL_LABELS, type TerminalProvider } from '@/app/terminal/providers';
import { readTerminalResponse, terminalErrorMessage } from '@/app/terminal/terminal-request';

type Event = { id: string; provider: TerminalProvider; sessionId: string; event: 'started' | 'reconnected' | 'stopped' | 'exited' | 'idle_timeout'; exitCode: number | null; userEmail: string | null; userName: string | null; createdAt: string };

async function fetchEvents(signal?: AbortSignal): Promise<Event[]> {
  const response = await fetch('/api/terminal/sessions', { cache: 'no-store', signal });
  return (await readTerminalResponse<{ events: Event[] }>(response)).events;
}

/** Admin-only lifecycle history. Input and output are never recorded. */
export default function TerminalSessionHistory({ className }: { className: string }) {
  const t = useTranslations('terminal.history');
  const tErrors = useTranslations('terminal.errors');
  const locale = useLocale();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState('');
  // setState only runs in the promise callbacks, never synchronously in the effect.
  const load = useCallback((signal?: AbortSignal) => fetchEvents(signal).then(
    data => { if (!signal?.aborted) { setEvents(data); setError(''); } },
    e => { if (!signal?.aborted) setError(terminalErrorMessage(e, tErrors, 'history_unavailable')); },
  ), [tErrors]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  return <section className={className}>
    <div className="flex items-start justify-between gap-3">
      <div><h2 className="font-semibold">{t('title')}</h2><p className="my-2 text-sm opacity-70">{t('description')}</p></div>
      <button onClick={() => void load()} className="shrink-0 text-sm underline">{t('refresh')}</button>
    </div>
    {error && <p role="alert" className="text-sm text-amber-500">{error}</p>}
    {!events && !error && <p className="text-sm opacity-60">{t('loading')}</p>}
    {events?.length === 0 && <p className="text-sm opacity-60">{t('empty')}</p>}
    {events && events.length > 0 && <ul className="max-h-72 divide-y divide-slate-500/20 overflow-y-auto text-sm">
      {events.map(event => <li key={event.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between">
        <span><span className="font-medium">{t(`events.${event.event}`)}</span>{event.event === 'exited' && event.exitCode !== null ? ` ${t('exitCode', { code: event.exitCode })}` : ''} · <span className="opacity-70">{event.userName || event.userEmail || t('system')}</span></span>
        <span className="text-xs opacity-60">{TERMINAL_LABELS[event.provider]} · {t('session', { id: event.sessionId.slice(0, 8) })} · {new Date(event.createdAt).toLocaleString(locale)}</span>
      </li>)}
    </ul>}
  </section>;
}
