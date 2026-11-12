'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTheme } from '@/app/context/ThemeContext';
import { loadProviderConfigurationStatus, saveUserSettings } from '@/app/actions/user';
import GarminSettings from '@/app/components/settings/GarminSettings';
import StravaSettings from '@/app/components/settings/StravaSettings';
import NotesConnectorsModal from '@/app/notes/NotesConnectorsModal';
import { listGoogleDriveConnections, listOneNoteConnections } from '@/app/actions/notes-connectors';
import TerminalConnectionCard from './TerminalConnectionCard';

const providers = [
  { id: 'anthropic', name: 'Anthropic API', description: 'Claude no chat e nas automações. Cobrança por API, separada da assinatura.', field: 'anthropicConfigured' },
  { id: 'openai', name: 'OpenAI API', description: 'Modelos OpenAI por API. Cobrança separada da assinatura ChatGPT.', field: 'openaiConfigured' },
  { id: 'google', name: 'Google AI / Gemini', description: 'Modelos e geração de conteúdo com uma chave do Google AI.', field: 'googleConfigured' },
  { id: 'github', name: 'GitHub Models', description: 'Modelos disponíveis pelo seu token GitHub.', field: 'githubConfigured' },
  { id: 'tavily', name: 'Tavily', description: 'Pesquisa na web para as ferramentas da Allerac.', field: 'tavilyConfigured' },
] as const;

type ProviderStatus = Awaited<ReturnType<typeof loadProviderConfigurationStatus>>;
export default function ConnectionsClient({ userId, health, notes, terminal, codexTerminal }: { userId: string; health: boolean; notes: boolean; terminal: boolean; codexTerminal: boolean }) {
  const { isDark } = useTheme();
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState('');
  const [key, setKey] = useState('');
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [documents, setDocuments] = useState<{ google_drive: string; onenote: string }>({ google_drive: 'Verificando…', onenote: 'Verificando…' });
  const card = `rounded-xl border p-5 ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`;
  const button = 'inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50';

  useEffect(() => {
    void loadProviderConfigurationStatus().then(setStatus).catch(() => setMessage('Não foi possível verificar as chaves de API.'));
    if (notes) void Promise.all([listGoogleDriveConnections(), listOneNoteConnections()]).then(([google, one]) => {
      const label = (result: typeof google) => !result.success ? 'Falha ao verificar' : !result.configured ? 'Requer configuração da unit' : result.connections.some(c => c.status === 'active') ? 'Conectado' : 'Não conectado';
      setDocuments({ google_drive: label(google), onenote: label(one) });
    }).catch(() => setDocuments({ google_drive: 'Falha ao verificar', onenote: 'Falha ao verificar' }));
  }, [notes, documentsOpen]);

  async function save(id: string) {
    if (!key.trim()) return;
    setSaving(true); setMessage('');
    try {
      const result = await saveUserSettings(id === 'github' ? key.trim() : undefined, id === 'tavily' ? key.trim() : undefined, undefined, id === 'google' ? key.trim() : undefined, id === 'anthropic' ? key.trim() : undefined, undefined, undefined, id === 'openai' ? key.trim() : undefined);
      if (!result.success) throw new Error('Falha ao salvar a chave');
      setKey(''); setEditing(''); setStatus(await loadProviderConfigurationStatus()); setMessage('Chave salva.');
    } catch { setMessage('Não foi possível salvar a chave.'); }
    finally { setSaving(false); }
  }

  return <main className={`h-dvh overflow-y-auto ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
    <div className="mx-auto max-w-5xl px-5 py-8">
      <header className="mb-7 flex items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">Conexões</h1><p className="mt-2 text-sm opacity-70">Contas e serviços que habilitam ferramentas na sua Allerac.</p></div><Link href="/" className="text-sm text-indigo-400 hover:underline">Voltar à Allerac</Link></header>
      {message && <p role="status" className="mb-4 rounded-lg border border-indigo-500 p-3 text-sm">{message}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <TerminalConnectionCard provider="claude" enabled={terminal} className={card} />
        <TerminalConnectionCard provider="codex" enabled={codexTerminal} className={card} />
        {providers.map(provider => <section className={card} key={provider.id}><h2 className="font-semibold">{provider.name}</h2><p className="my-2 text-sm opacity-70">{provider.description}</p><p className="mb-3 text-sm">{status ? status[provider.field] ? 'Configurado para seu uso' : 'Não configurado' : 'Verificando…'}</p>
          {editing === provider.id ? <form onSubmit={event => { event.preventDefault(); void save(provider.id); }} className="flex flex-wrap gap-2"><input type="password" value={key} onChange={event => setKey(event.target.value)} autoComplete="off" aria-label={`Chave de API ${provider.name}`} placeholder="Cole sua chave de API" className="min-w-0 flex-1 rounded-lg border border-slate-500 bg-transparent px-3 py-2 text-sm" required /><button disabled={saving} className={button}>Salvar</button><button type="button" disabled={saving} onClick={() => { setEditing(''); setKey(''); }} className="text-sm underline">Cancelar</button></form> : <button className={button} onClick={() => { setEditing(provider.id); setKey(''); }}>Configurar minha chave</button>}
          <p className="mt-3 text-xs opacity-60">Chave pessoal; a unit também pode fornecer uma chave compartilhada.</p>
        </section>)}
        <section className={card}><h2 className="font-semibold">Strava</h2><p className="my-2 text-sm opacity-70">Atividades e histórico de treinos · sua conta.</p>{health ? <StravaSettings userId={userId} isDarkMode={isDark} /> : <p className="text-sm opacity-60">Requer acesso à área Saúde.</p>}</section>
        <section className={card}><h2 className="font-semibold">Garmin</h2><p className="my-2 text-sm opacity-70">Saúde e atividades · sua conta.</p>{health ? <GarminSettings userId={userId} isDarkMode={isDark} /> : <p className="text-sm opacity-60">Requer acesso à área Saúde.</p>}</section>
        {(['google_drive', 'onenote'] as const).map(id => <section key={id} className={card}><h2 className="font-semibold">{id === 'google_drive' ? 'Google Drive' : 'Microsoft OneNote'}</h2><p className="my-2 text-sm opacity-70">Importar e sincronizar documentos autorizados · sua conta.</p><p className="mb-3 text-sm">{notes ? documents[id] : 'Requer acesso à área Notas.'}</p>{notes && <button onClick={() => setDocumentsOpen(true)} className={button}>Gerenciar conexão</button>}</section>)}
      </div>
      {notes && <NotesConnectorsModal isDarkMode={isDark} isOpen={documentsOpen} onClose={() => setDocumentsOpen(false)} />}
    </div>
  </main>;
}
