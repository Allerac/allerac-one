'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Terminal } from '@xterm/xterm';
import { createTerminalInputQueue } from './terminal-input';
import { TERMINAL_LABELS, type TerminalProvider } from './providers';
import { needsTerminalUnlock, readTerminalResponse, terminalErrorMessage } from './terminal-request';
import TerminalUnlockForm from './TerminalUnlockForm';
import '@xterm/xterm/css/xterm.css';

export default function TerminalClient({ provider, available }: { provider: TerminalProvider; available: TerminalProvider[] }) {
  const router = useRouter();
  const t = useTranslations('terminal.page');
  const tErrors = useTranslations('terminal.errors');
  const container = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const session = useRef<string | null>(null);
  const wakeOutput = useRef<(() => void) | null>(null);
  const lastInput = useRef(0);
  const inputQueue = useRef<ReturnType<typeof createTerminalInputQueue> | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [locked, setLocked] = useState<boolean | null>(null);
  // Translate a failure; a reauth failure also shows the unlock prompt.
  const fail = useCallback((e: unknown, fallbackKey = 'generic') => {
    if (needsTerminalUnlock(e)) setLocked(true);
    setError(terminalErrorMessage(e, tErrors, fallbackKey));
  }, [tErrors]);
  // The xterm instance and output poller must not restart when translations change identity.
  const failRef = useRef(fail);
  const tRef = useRef(t);
  useEffect(() => { failRef.current = fail; tRef.current = t; }, [fail, t]);

  const post = useCallback(async (operation: string, body: object) => {
    const response = await fetch(`/api/terminal/${operation}?provider=${provider}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
    return readTerminalResponse<{ id: string }>(response);
  }, [provider]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/terminal/unlock', { cache: 'no-store', signal: controller.signal })
      .then(response => readTerminalResponse<{ unlocked: boolean }>(response))
      .then(result => setLocked(!result.unlocked))
      .catch(() => { if (!controller.signal.aborted) setLocked(true); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
      if (disposed || !container.current) return;
      const term = new Terminal({ cursorBlink: true, screenReaderMode: true, fontSize: 14, fontFamily: 'Consolas, monospace', scrollback: 5000, theme: { background: '#090f1c', foreground: '#e2e8f0' } });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(container.current);
      fit.fit();
      terminal.current = term;
      const queue = createTerminalInputQueue({
        send: async (id, data) => { await post('input', { id, data }); },
        onActivity: () => { lastInput.current = performance.now(); wakeOutput.current?.(); },
        onError: error => { session.current = null; setConnected(false); failRef.current(error, 'sendFailed'); },
      });
      inputQueue.current = queue;
      const input = term.onData(data => {
        const id = session.current;
        if (id) queue.push(id, data);
      });
      const resize = term.onResize(({ cols, rows }) => { if (session.current) void post('resize', { id: session.current, cols, rows }).catch(e => failRef.current(e)); });
      const observer = new ResizeObserver(() => fit.fit());
      observer.observe(container.current);
      setReady(true);
      cleanup = () => { queue.dispose(); inputQueue.current = null; observer.disconnect(); input.dispose(); resize.dispose(); term.dispose(); terminal.current = null; };
    })().catch(e => failRef.current(e));
    return () => { disposed = true; cleanup(); };
  }, [post]);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let cursor = 0;
    let polling = false;
    let urgent = false;
    const controller = new AbortController();
    const poll = async () => {
      if (cancelled || polling) return;
      polling = true;
      urgent = false;
      let delay = 250;
      try {
        const response = await fetch(`/api/terminal/output?cursor=${cursor}&provider=${provider}`, { cache: 'no-store', signal: controller.signal });
        const result = await readTerminalResponse<{ id: string; truncated: boolean; data: string; cursor: number; running: boolean }>(response);
        if (cancelled) return;
        if (result.id !== session.current) { cancelled = true; setConnected(false); setError(tRef.current('sessionChanged')); return; }
        if (result.truncated) { cancelled = true; setConnected(false); setError(tRef.current('historyTruncated')); return; }
        terminal.current?.write(result.data);
        cursor = result.cursor;
        if (!result.running) { setConnected(false); session.current = null; setError(tRef.current('sessionEnded')); return; }
        delay = result.data || performance.now() - lastInput.current < 750 ? 16 : 250;
      } catch (e) { if (!cancelled) { cancelled = true; setConnected(false); failRef.current(e); } }
      finally {
        polling = false;
        if (!cancelled && session.current) timer = setTimeout(poll, urgent ? 0 : delay);
      }
    };
    const wake = () => {
      if (cancelled) return;
      clearTimeout(timer);
      if (polling) urgent = true;
      else void poll();
    };
    wakeOutput.current = wake;
    void poll();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); if (wakeOutput.current === wake) wakeOutput.current = null; };
  }, [connected, generation, provider]);

  async function start() {
    if (!terminal.current) return;
    setBusy(true); setError('');
    try {
      const result = await post('start', { cols: terminal.current.cols, rows: terminal.current.rows });
      session.current = result.id;
      inputQueue.current?.reset();
      terminal.current.reset();
      setGeneration(value => value + 1); setConnected(true); terminal.current.focus();
    } catch (e) { fail(e, 'startFailed'); }
    finally { setBusy(false); }
  }

  async function stop() {
    setBusy(true);
    try { inputQueue.current?.reset(); await post('stop', { id: session.current }); setConnected(false); session.current = null; }
    catch (e) { fail(e, 'stopFailed'); }
    finally { setBusy(false); }
  }

  return <main className="flex h-dvh flex-col bg-slate-950 text-slate-100">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
      <div><h1 className="text-lg font-semibold">{t('title')}</h1><p className="text-sm text-slate-400">{TERMINAL_LABELS[provider]} · {t('localSession')} · {connected ? t('connected') : t('disconnected')}</p></div>
      <nav className="flex items-center gap-3 text-sm"><Link href="/connections" className="text-slate-300 hover:underline">{t('connections')}</Link><Link href="/" className="text-slate-300 hover:underline">{t('back')}</Link>
        <label className="sr-only" htmlFor="terminal-provider">{t('provider')}</label>
        <select id="terminal-provider" value={provider} disabled={busy} onChange={event => router.push(`/terminal?provider=${event.target.value}`)} className="max-w-48 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2">
          {available.map(value => <option key={value} value={value}>{TERMINAL_LABELS[value]}</option>)}
        </select>
        <button disabled={busy || !ready || connected || locked !== false} onClick={start} className="rounded-lg bg-indigo-600 px-4 py-2 disabled:opacity-40">{busy ? t('wait') : t('open')}</button>
        <button disabled={busy || !session.current} onClick={stop} className="rounded-lg border border-slate-600 px-4 py-2 disabled:opacity-40">{t('stop')}</button>
      </nav>
    </header>
    {locked && <TerminalUnlockForm onUnlocked={() => { setLocked(false); setError(''); }} />}
    <p className="px-5 py-2 text-xs text-slate-400">{t('help')}</p>
    {error && <p role="alert" className="bg-amber-950 px-5 py-2 text-sm text-amber-200">{error}</p>}
    <div ref={container} className="min-h-0 flex-1 overflow-hidden p-3" aria-label={t('terminalLabel', { provider: TERMINAL_LABELS[provider] })} />
  </main>;
}
