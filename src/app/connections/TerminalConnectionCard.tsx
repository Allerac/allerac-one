'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { TERMINAL_LABELS, type TerminalProvider } from '@/app/terminal/providers';
import { readTerminalResponse, terminalErrorMessage } from '@/app/terminal/terminal-request';
import TerminalApiConnection from './TerminalApiConnection';

type Status = { loggedIn: boolean; authMethod?: string | null; email: string | null; plan: string | null };

export default function TerminalConnectionCard({ provider, enabled, className }: { provider: TerminalProvider; enabled: boolean; className: string }) {
  const t = useTranslations('terminal.card');
  const tErrors = useTranslations('terminal.errors');
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const refresh = useCallback((signal?: AbortSignal) => fetch(`/api/terminal/status?provider=${provider}`, { cache: 'no-store', signal })
    .then(response => readTerminalResponse<Status>(response))
    .then(
      data => { if (!signal?.aborted) { setError(''); setStatus(data); } },
      e => { if (!signal?.aborted) { setStatus(null); setError(terminalErrorMessage(e, tErrors, 'bridgeUnavailable')); } },
    ), [provider, tErrors]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [enabled, refresh]);

  const connectedLabel = provider === 'codex'
    ? status?.authMethod === 'chatgpt' ? t('codexSubscription') : t('codexApiLogin')
    : t('claudeConnected', { account: status?.email || t('claudeAccount'), plan: status?.plan || t('planUnknown') });
  return <section className={className}>
    <h2 className="font-semibold">{t('title', { provider: TERMINAL_LABELS[provider] })}</h2>
    <p className="my-2 text-sm opacity-70">{t('description', { cli: provider === 'codex' ? 'Codex' : 'Claude Code' })}</p>
    {enabled ? <>
      <p className="mb-3 text-sm">{error || (status ? status.loggedIn ? connectedLabel : t('notSignedIn') : t('checking'))}</p>
      <Link href={`/terminal?provider=${provider}`} className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">{t('openTerminal')}</Link>
      <button onClick={() => void refresh()} className="ml-3 text-sm underline">{t('checkConnection')}</button>
      <p className="mt-3 text-xs opacity-60">{t('ownerOnly')}</p>
      <TerminalApiConnection provider={provider} />
    </> : <p className="text-sm opacity-60">{t('unavailable')}</p>}
  </section>;
}
