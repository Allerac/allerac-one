'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { TerminalProvider } from '@/app/terminal/providers';
import { needsTerminalUnlock, readTerminalResponse, terminalErrorMessage } from '@/app/terminal/terminal-request';
import TerminalUnlockForm from '@/app/terminal/TerminalUnlockForm';

type Connection = { connected: boolean; scopes: string[]; expiresAt: string | null };
type Option = { id: string; scopes: string[] };
type ConnectionResponse = { connection: Connection; options: Option[] };

export default function TerminalApiConnection({ provider }: { provider: TerminalProvider }) {
  const t = useTranslations('terminal.api');
  const tErrors = useTranslations('terminal.errors');
  const [connection, setConnection] = useState<Connection | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await readTerminalResponse<ConnectionResponse>(await fetch(`/api/terminal/connection?provider=${provider}`, { cache: 'no-store', signal }));
      if (signal?.aborted) return;
      setConnection(data.connection); setOptions(data.options);
      setSelected(data.options.filter(option => option.scopes.every(scope => data.connection.scopes.includes(scope))).map(option => option.id));
      setError('');
    } catch (e) { if (!signal?.aborted) setError(terminalErrorMessage(e, tErrors, 'checkFailed')); }
  }, [provider, tErrors]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  async function change(disconnect: boolean) {
    setBusy(true); setError(''); setMessage('');
    try {
      const scopes = [...new Set(options.filter(option => selected.includes(option.id)).flatMap(option => option.scopes))];
      const response = await fetch(`/api/terminal/connection?provider=${provider}`, { method: disconnect ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, ...(!disconnect ? { body: JSON.stringify({ scopes }) } : {}) });
      const data = await readTerminalResponse<{ connection: Connection }>(response);
      setConnection(data.connection);
      setMessage(disconnect ? t('revoked') : t('connectedMessage'));
    } catch (e) {
      if (needsTerminalUnlock(e)) setLocked(true);
      else setError(terminalErrorMessage(e, tErrors, 'connectionFailed'));
    }
    finally { setBusy(false); }
  }

  return <div className="mt-5 border-t border-slate-500/30 pt-4">
    <h3 className="text-sm font-semibold">{t('title')}</h3>
    <p className="my-2 text-xs opacity-70">{t('description')}</p>
    <p className="mb-2 text-sm">{connection ? connection.connected ? t('statusConnected') : t('statusDisconnected') : t('statusChecking')}</p>
    {connection?.connected && connection.expiresAt && <p className="mb-2 text-xs opacity-60">{t('validUntil', { date: new Date(connection.expiresAt).toLocaleDateString() })}</p>}
    <p className="mb-2 text-xs opacity-70">{t('baseScopes')}</p>
    <div className="mb-3 space-y-2">{options.map(option => <label key={option.id} className="flex items-start gap-2 text-xs"><input type="checkbox" disabled={busy} checked={selected.includes(option.id)} onChange={event => setSelected(current => event.target.checked ? [...current, option.id] : current.filter(id => id !== option.id))} /><span>{t(`scopes.${option.id}`)}</span></label>)}</div>
    {locked && <TerminalUnlockForm compact onUnlocked={() => { setLocked(false); void change(false); }} />}
    {error && <p role="alert" className="mb-2 text-xs text-amber-500">{error}</p>}
    {message && <p role="status" className="mb-2 text-xs text-indigo-400">{message}</p>}
    <div className="flex flex-wrap gap-3"><button disabled={busy || !connection} onClick={() => void change(false)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white disabled:opacity-40">{connection?.connected ? t('update') : t('connect')}</button>
      <button disabled={busy} onClick={() => void change(true)} className="text-xs underline disabled:opacity-40">{t('disconnect')}</button>
      <button disabled={busy} onClick={() => void load()} className="text-xs underline disabled:opacity-40">{t('check')}</button></div>
  </div>;
}
