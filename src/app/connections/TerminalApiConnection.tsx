'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TerminalProvider } from '@/app/terminal/providers';

type Connection = { connected: boolean; scopes: string[]; expiresAt: string | null };
type Option = { id: string; label: string; scopes: string[] };

export default function TerminalApiConnection({ provider }: { provider: TerminalProvider }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/terminal/connection?provider=${provider}`, { cache: 'no-store', signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (signal?.aborted) return;
      setConnection(data.connection); setOptions(data.options);
      setSelected(data.options.filter((option: Option) => option.scopes.every(scope => data.connection.scopes.includes(scope))).map((option: Option) => option.id));
      setError('');
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : 'Falha ao verificar a conexão.'); }
  }, [provider]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  async function change(disconnect: boolean) {
    setBusy(true); setError(''); setMessage('');
    try {
      const scopes = [...new Set(options.filter(option => selected.includes(option.id)).flatMap(option => option.scopes))];
      const response = await fetch(`/api/terminal/connection?provider=${provider}`, { method: disconnect ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, ...(!disconnect ? { body: JSON.stringify({ scopes }) } : {}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setConnection(data.connection);
      setMessage(disconnect ? 'Acesso à API revogado.' : 'Ferramenta da Allerac conectada. Abra uma nova sessão do terminal para carregá-la pela primeira vez.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha na conexão.'); }
    finally { setBusy(false); }
  }

  return <div className="mt-5 border-t border-slate-500/30 pt-4">
    <h3 className="text-sm font-semibold">API da Allerac no terminal</h3>
    <p className="my-2 text-xs opacity-70">Habilita ferramentas para o agente consultar e operar sua Allerac. A chave é gerada automaticamente, vale por 30 dias e pode ser revogada aqui.</p>
    <p className="mb-2 text-sm">{connection ? connection.connected ? 'API conectada' : 'API não conectada' : 'Verificando API…'}</p>
    {connection?.connected && connection.expiresAt && <p className="mb-2 text-xs opacity-60">Válida até {new Date(connection.expiresAt).toLocaleDateString()}</p>}
    <p className="mb-2 text-xs opacity-70">Sempre inclui leitura da sua identidade, áreas e serviços disponíveis.</p>
    <div className="mb-3 space-y-2">{options.map(option => <label key={option.id} className="flex items-start gap-2 text-xs"><input type="checkbox" disabled={busy} checked={selected.includes(option.id)} onChange={event => setSelected(current => event.target.checked ? [...current, option.id] : current.filter(id => id !== option.id))} /><span>{option.label}</span></label>)}</div>
    {error && <p role="alert" className="mb-2 text-xs text-amber-500">{error}</p>}
    {message && <p role="status" className="mb-2 text-xs text-indigo-400">{message}</p>}
    <div className="flex flex-wrap gap-3"><button disabled={busy || !connection} onClick={() => void change(false)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white disabled:opacity-40">{connection?.connected ? 'Atualizar acessos' : 'Conectar API'}</button>
      <button disabled={busy} onClick={() => void change(true)} className="text-xs underline disabled:opacity-40">Desconectar API</button>
      <button disabled={busy} onClick={() => void load()} className="text-xs underline disabled:opacity-40">Verificar API</button></div>
  </div>;
}
