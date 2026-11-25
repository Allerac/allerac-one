'use client';

import { useCallback, useEffect, useState } from 'react';
import { TERMINAL_LABELS, type TerminalProvider } from '@/app/terminal/providers';

type Event = { id: string; provider: TerminalProvider; sessionId: string; event: 'started' | 'reconnected' | 'stopped' | 'exited' | 'idle_timeout'; exitCode: number | null; userEmail: string | null; userName: string | null; createdAt: string };

const LABELS: Record<Event['event'], string> = {
  started: 'Iniciou a sessão',
  reconnected: 'Conectou-se à sessão',
  stopped: 'Encerrou a sessão',
  exited: 'CLI encerrado',
  idle_timeout: 'Encerrada por inatividade',
};

/** Admin-only lifecycle history. Input and output are never recorded. */
export default function TerminalSessionHistory({ className }: { className: string }) {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/terminal/sessions', { cache: 'no-store', signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (!signal?.aborted) { setEvents(data.events); setError(''); }
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : 'Falha ao carregar o histórico.'); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  return <section className={className}>
    <div className="flex items-start justify-between gap-3">
      <div><h2 className="font-semibold">Histórico do terminal</h2><p className="my-2 text-sm opacity-70">Quem iniciou, conectou ou encerrou sessões e como terminaram. O que foi digitado e a saída não são registrados. Últimos 90 dias.</p></div>
      <button onClick={() => void load()} className="shrink-0 text-sm underline">Atualizar</button>
    </div>
    {error && <p role="alert" className="text-sm text-amber-500">{error}</p>}
    {!events && !error && <p className="text-sm opacity-60">Carregando…</p>}
    {events?.length === 0 && <p className="text-sm opacity-60">Nenhuma sessão registrada.</p>}
    {events && events.length > 0 && <ul className="max-h-72 divide-y divide-slate-500/20 overflow-y-auto text-sm">
      {events.map(event => <li key={event.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between">
        <span><span className="font-medium">{LABELS[event.event]}</span>{event.event === 'exited' && event.exitCode !== null ? ` (código ${event.exitCode})` : ''} · <span className="opacity-70">{event.userName || event.userEmail || 'sistema'}</span></span>
        <span className="text-xs opacity-60">{TERMINAL_LABELS[event.provider]} · sessão {event.sessionId.slice(0, 8)} · {new Date(event.createdAt).toLocaleString()}</span>
      </li>)}
    </ul>}
  </section>;
}
