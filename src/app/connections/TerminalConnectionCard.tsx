'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TERMINAL_LABELS, type TerminalProvider } from '@/app/terminal/providers';
import TerminalApiConnection from './TerminalApiConnection';

type Status = { loggedIn: boolean; authMethod?: string | null; email: string | null; plan: string | null };

export default function TerminalConnectionCard({ provider, enabled, isAdmin, className }: { provider: TerminalProvider; enabled: boolean; isAdmin: boolean; className: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setError('');
    try {
      const response = await fetch(`/api/terminal/status?provider=${provider}`, { cache: 'no-store', signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (!signal?.aborted) setStatus(data);
    } catch (e) { if (!signal?.aborted) { setStatus(null); setError(e instanceof Error ? e.message : 'Serviço de terminal indisponível'); } }
  }, [provider]);
  useEffect(() => {
    const controller = new AbortController();
    if (enabled) void refresh(controller.signal);
    return () => controller.abort();
  }, [enabled, refresh]);

  const connectedLabel = provider === 'codex'
    ? status?.authMethod === 'chatgpt' ? 'Conectado com ChatGPT · assinatura' : 'Login por API — entre com ChatGPT no Codex para usar a assinatura.'
    : `Conectado · ${status?.email || 'Conta Claude'} · ${status?.plan || 'plano não informado'}`;
  return <section className={className}>
    <h2 className="font-semibold">{TERMINAL_LABELS[provider]} na unit</h2>
    <p className="my-2 text-sm opacity-70">Sessão interativa compartilhada, num container desta unit. O login e as aprovações são controlados pelo {provider === 'codex' ? 'Codex' : 'Claude Code'} original.</p>
    {enabled ? <>
      <p className="mb-3 text-sm">{error || (status ? status.loggedIn ? connectedLabel : 'Não autenticado — abra o terminal para entrar na sua conta.' : 'Verificando…')}</p>
      <Link href={`/terminal?provider=${provider}`} className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">Abrir terminal</Link>
      <button onClick={() => void refresh()} className="ml-3 text-sm underline">Verificar conexão</button>
      <p className="mt-3 text-xs opacity-60">Compartilhado por todos com acesso ao terminal nesta unit: mesma sessão, mesmo login e mesmo workspace. Login e logout no próprio terminal valem para todos.</p>
      {isAdmin ? <TerminalApiConnection provider={provider} /> : <p className="mt-3 text-xs opacity-60">As ferramentas da API da Allerac neste terminal são configuradas por um administrador.</p>}
    </> : <p className="text-sm opacity-60">Indisponível para seu usuário nesta unit. Peça acesso ao terminal a um administrador.</p>}
  </section>;
}
