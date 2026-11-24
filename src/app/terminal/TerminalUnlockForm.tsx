'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { prehashPassword } from '@/app/lib/password-prehash';
import { readTerminalResponse, terminalErrorMessage } from './terminal-request';

/** Password confirmation that unlocks terminal access for the current session. */
export default function TerminalUnlockForm({ onUnlocked, compact = false }: { onUnlocked: (expiresAt: string) => void; compact?: boolean }) {
  const t = useTranslations('terminal.unlock');
  const tErrors = useTranslations('terminal.errors');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const body = password ? { password: await prehashPassword(password) } : {};
      const result = await readTerminalResponse<{ expiresAt: string }>(await fetch('/api/terminal/unlock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
      }));
      setPassword('');
      onUnlocked(result.expiresAt);
    } catch (e) { setError(terminalErrorMessage(e, tErrors)); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className={compact ? 'my-3 space-y-2' : 'space-y-2 border-b border-slate-800 bg-slate-900 px-5 py-4'}>
    <p className={compact ? 'text-xs font-semibold' : 'text-sm font-semibold'}>{t('title')}</p>
    <p className="text-xs opacity-70">{t('description')}</p>
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`terminal-unlock-${compact ? 'compact' : 'page'}`}>{t('passwordLabel')}</label>
      <input id={`terminal-unlock-${compact ? 'compact' : 'page'}`} type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder={t('passwordLabel')} className="min-w-0 flex-1 rounded-lg border border-slate-500 bg-transparent px-3 py-2 text-sm" />
      <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-40">{busy ? t('confirming') : t('confirm')}</button>
    </div>
    {error && <p role="alert" className="text-xs text-amber-400">{error}</p>}
  </form>;
}
