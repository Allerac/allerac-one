'use client';

import { useState, useCallback, useEffect } from 'react';
import Script from 'next/script';
import {
  listGoogleDriveConnections,
  importGoogleDriveSelection,
  resyncGoogleDrive,
  listGoogleDriveConflicts,
  resolveGoogleDriveConflict,
  disconnectGoogleDrive,
  listOneNoteConnections,
  getOneNoteItems,
  importOneNoteSelection,
  resyncOneNote,
  listOneNoteConflicts,
  resolveOneNoteConflict,
  disconnectOneNote,
} from '@/app/actions/notes-connectors';
import ConnectorConflictModal from './ConnectorConflictModal';
import OneNoteSelectionModal from './OneNoteSelectionModal';

interface Props {
  isDarkMode: boolean;
  isOpen: boolean;
  onClose: () => void;
  onImported?: () => void;
}

interface Connection {
  credentialId: string;
  accountId: string | null;
  accountLabel: string | null;
  scopes: string | null;
  status: 'active' | 'revoked' | 'error';
  lastSyncAt: string | Date | null;
  lastError: string | null;
}

interface ConflictItem {
  externalId: string;
  noteId: string;
  sourceUrl: string;
  title: string | null;
}

interface OneNoteItem {
  externalId: string;
  title: string;
  sourceUrl: string;
  parentLabel: string;
  modifiedAt: string;
}

// Google Picker/gapi ship no first-party types; these are the only shapes this file touches.
interface GooglePickerDocsView {
  setMimeTypes: (m: string) => GooglePickerDocsView;
  setIncludeFolders: (v: boolean) => GooglePickerDocsView;
  setOwnedByMe: (v: boolean) => GooglePickerDocsView;
}

interface GooglePickerBuilder {
  addView: (view: GooglePickerDocsView) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setOrigin: (origin: string) => GooglePickerBuilder;
  setAppId: (appId: string) => GooglePickerBuilder;
  enableFeature: (feature: unknown) => GooglePickerBuilder;
  setCallback: (cb: (data: { action: string; docs?: { id: string; name: string }[] }) => void) => GooglePickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
}

interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    gapi?: { load: (api: string, callback: () => void) => void };
    google?: {
      picker: {
        DocsView: new (viewId: unknown) => GooglePickerDocsView;
        ViewId: { DOCS: unknown };
        PickerBuilder: new () => GooglePickerBuilder;
        Feature: { MULTISELECT_ENABLED: unknown };
        Action: { PICKED: string; CANCEL: string };
      };
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

const PICKER_MIME_TYPES = 'application/vnd.google-apps.document,text/plain,text/markdown,application/pdf';

function formatSync(conn: Connection): string {
  const parts: string[] = [conn.accountLabel ?? 'Connected'];
  if (conn.lastSyncAt) parts.push(`synced ${new Date(conn.lastSyncAt).toLocaleString()}`);
  return parts.join(' · ');
}

export default function NotesConnectorsModal({ isDarkMode: d, isOpen, onClose, onImported }: Props) {
  const [pickerReady, setPickerReady] = useState(false);
  const [gisReady, setGisReady] = useState(false);

  const [googleConfigured, setGoogleConfigured] = useState(true);
  const [googleConnections, setGoogleConnections] = useState<Connection[]>([]);
  const [oneNoteConfigured, setOneNoteConfigured] = useState(true);
  const [oneNoteConnections, setOneNoteConnections] = useState<Connection[]>([]);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  const [conflictTarget, setConflictTarget] = useState<{ provider: 'google_drive' | 'onenote'; credentialId: string; label: string } | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const [oneNoteSelectionFor, setOneNoteSelectionFor] = useState<string | null>(null);
  const [oneNoteItemsList, setOneNoteItemsList] = useState<OneNoteItem[]>([]);
  const [oneNoteItemsLoading, setOneNoteItemsLoading] = useState(false);

  const setMsg = useCallback((credentialId: string, text: string) => {
    setMessages(prev => ({ ...prev, [credentialId]: text }));
  }, []);

  const [conflictCounts, setConflictCounts] = useState<Record<string, number>>({});

  const loadConflictCounts = useCallback(async (provider: 'google_drive' | 'onenote', connections: Connection[]) => {
    const entries = await Promise.all(connections.map(async conn => {
      const res = provider === 'google_drive' ? await listGoogleDriveConflicts(conn.credentialId) : await listOneNoteConflicts(conn.credentialId);
      return [conn.credentialId, res.success ? res.conflicts.length : 0] as const;
    }));
    setConflictCounts(prev => ({ ...prev, ...Object.fromEntries(entries) }));
  }, []);

  const loadGoogle = useCallback(async () => {
    const res = await listGoogleDriveConnections();
    setGoogleConfigured(res.configured);
    if (res.success) {
      setGoogleConnections(res.connections as Connection[]);
      loadConflictCounts('google_drive', res.connections as Connection[]);
    }
  }, [loadConflictCounts]);

  const loadOneNote = useCallback(async () => {
    const res = await listOneNoteConnections();
    setOneNoteConfigured(res.configured);
    if (res.success) {
      setOneNoteConnections(res.connections as Connection[]);
      loadConflictCounts('onenote', res.connections as Connection[]);
    }
  }, [loadConflictCounts]);

  useEffect(() => { if (isOpen) { loadGoogle(); loadOneNote(); } }, [isOpen, loadGoogle, loadOneNote]);

  // Clear ?connector=<provider>&status=... left by either OAuth redirect —
  // ChatClient already opens this modal when it sees that param.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connector') !== 'google_drive' && params.get('connector') !== 'onenote') return;
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const openConflictModal = useCallback(async (provider: 'google_drive' | 'onenote', credentialId: string, label: string) => {
    const res = provider === 'google_drive' ? await listGoogleDriveConflicts(credentialId) : await listOneNoteConflicts(credentialId);
    const list = res.success ? (res.conflicts as ConflictItem[]) : [];
    setConflicts(list);
    setConflictCounts(prev => ({ ...prev, [credentialId]: list.length }));
    setConflictTarget({ provider, credentialId, label });
  }, []);

  const handleResolveConflict = useCallback(async (externalId: string, resolution: 'keep_local' | 'use_source') => {
    if (!conflictTarget) return;
    setResolvingId(externalId);
    const resolveRes = conflictTarget.provider === 'google_drive'
      ? await resolveGoogleDriveConflict(conflictTarget.credentialId, externalId, resolution)
      : await resolveOneNoteConflict(conflictTarget.credentialId, externalId, resolution);
    if (!resolveRes.success) {
      setResolvingId(null);
      return;
    }
    const res = conflictTarget.provider === 'google_drive'
      ? await listGoogleDriveConflicts(conflictTarget.credentialId)
      : await listOneNoteConflicts(conflictTarget.credentialId);
    const remaining = res.success ? (res.conflicts as ConflictItem[]) : [];
    setConflicts(remaining);
    setConflictCounts(prev => ({ ...prev, [conflictTarget.credentialId]: remaining.length }));
    if (remaining.length === 0) setConflictTarget(null);
    setResolvingId(null);
    onImported?.();
  }, [conflictTarget, onImported]);

  const launchPicker = useCallback((credentialId: string, accessToken: string) => {
    const google = window.google;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;
    if (!google || !apiKey) {
      setMsg(credentialId, 'Seletor do Google ainda não carregou — tente novamente em instantes.');
      return;
    }

    // drive.file only ever grants files.get access to what's picked here —
    // it never grants files.list over a folder's contents. Folders are for
    // navigation only; import individual files (multi-select works).
    // setOwnedByMe(true): without it, DocsView(DOCS) merges "My Drive +
    // Shared with me + Recent," producing duplicate folder entries and empty
    // results navigating into a Recent-sourced duplicate.
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setMimeTypes(PICKER_MIME_TYPES)
      .setIncludeFolders(true)
      .setOwnedByMe(true);

    // Numeric prefix of the OAuth client_id is the GCP project number by
    // convention. setAppId is what registers the picked file's drive.file
    // grant against this project — without it every files.get 404s later.
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
    const appId = clientId.split('-')[0];

    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setOrigin(window.location.protocol + '//' + window.location.host)
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setCallback(async (data: { action: string; docs?: { id: string; name: string }[] }) => {
        if (data.action === google.picker.Action.CANCEL) return;
        if (data.action !== google.picker.Action.PICKED || !data.docs?.length) return;

        setBusyId(credentialId);
        setMsg(credentialId, `Importando ${data.docs.length} item(ns)…`);
        const importRes = await importGoogleDriveSelection(credentialId, data.docs.map(doc => ({ id: doc.id, name: doc.name })), accessToken);
        if (importRes.success && importRes.summary) {
          const s = importRes.summary;
          setMsg(credentialId, `Importado: ${s.imported} nova(s), ${s.updated} atualizada(s)${s.failed.length ? `, ${s.failed.length} falha(s)` : ''}.`);
          onImported?.();
        } else {
          setMsg(credentialId, importRes.error ?? 'Falha ao importar.');
        }
        setBusyId(null);
      })
      .build();

    picker.setVisible(true);
  }, [onImported, setMsg]);

  const openPicker = useCallback((credentialId: string) => {
    setMsg(credentialId, '');
    const google = window.google;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!google?.accounts || !clientId) {
      setMsg(credentialId, 'Ainda carregando o Google Identity Services — tente novamente em instantes.');
      return;
    }

    // The Picker token is minted live, in the browser, via Google Identity
    // Services — NOT reused from the server-side connection. Google only
    // registers a picked file's per-file drive.file grant when the token
    // came from this exact client-side flow. Choose the same Google account
    // in the popup that matches this card — it isn't cross-checked.
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: response => {
        if (!response.access_token) {
          setMsg(credentialId, 'Não foi possível obter acesso ao Google Drive.');
          return;
        }
        launchPicker(credentialId, response.access_token);
      },
    });
    tokenClient.requestAccessToken();
  }, [launchPicker, setMsg]);

  const refreshConflictCount = useCallback(async (provider: 'google_drive' | 'onenote', credentialId: string) => {
    const res = provider === 'google_drive' ? await listGoogleDriveConflicts(credentialId) : await listOneNoteConflicts(credentialId);
    setConflictCounts(prev => ({ ...prev, [credentialId]: res.success ? res.conflicts.length : 0 }));
  }, []);

  const handleResyncGoogle = useCallback(async (credentialId: string) => {
    setBusyId(credentialId);
    setMsg(credentialId, '');
    const res = await resyncGoogleDrive(credentialId);
    if (res.success && res.summary) {
      const s = res.summary;
      setMsg(credentialId, `Sincronizado: ${s.updated} atualizada(s), ${s.unchanged} sem mudança, ${s.conflicts} conflito(s).`);
      await refreshConflictCount('google_drive', credentialId);
      if (s.conflicts > 0) openConflictModal('google_drive', credentialId, 'Google Drive');
      onImported?.();
    } else {
      setMsg(credentialId, res.error ?? 'Falha ao sincronizar.');
    }
    setBusyId(null);
  }, [onImported, setMsg, openConflictModal, refreshConflictCount]);

  const handleDisconnectGoogle = useCallback(async (credentialId: string) => {
    if (!window.confirm('Desconectar esta conta do Google Drive? As notas já importadas continuam no seu vault.')) return;
    await disconnectGoogleDrive(credentialId);
    await loadGoogle();
  }, [loadGoogle]);

  const handleOpenOneNoteSelection = useCallback(async (credentialId: string) => {
    setMsg(credentialId, '');
    setOneNoteSelectionFor(credentialId);
    setOneNoteItemsLoading(true);
    const res = await getOneNoteItems(credentialId);
    if (res.success) setOneNoteItemsList(res.items as OneNoteItem[]);
    else setMsg(credentialId, res.error ?? 'Falha ao listar notebooks.');
    setOneNoteItemsLoading(false);
  }, [setMsg]);

  const handleImportOneNote = useCallback(async (selected: OneNoteItem[]) => {
    if (!oneNoteSelectionFor) return;
    const credentialId = oneNoteSelectionFor;
    setBusyId(credentialId);
    const res = await importOneNoteSelection(credentialId, selected);
    if (res.success && res.summary) {
      const s = res.summary;
      setMsg(credentialId, `Importado: ${s.imported} nova(s), ${s.updated} atualizada(s)${s.failed.length ? `, ${s.failed.length} falha(s)` : ''}.`);
      onImported?.();
    } else {
      setMsg(credentialId, res.error ?? 'Falha ao importar.');
    }
    setBusyId(null);
    setOneNoteSelectionFor(null);
  }, [oneNoteSelectionFor, onImported, setMsg]);

  const handleResyncOneNote = useCallback(async (credentialId: string) => {
    setBusyId(credentialId);
    setMsg(credentialId, '');
    const res = await resyncOneNote(credentialId);
    if (res.success && res.summary) {
      const s = res.summary;
      setMsg(credentialId, `Sincronizado: ${s.updated} atualizada(s), ${s.unchanged} sem mudança, ${s.conflicts} conflito(s).`);
      await refreshConflictCount('onenote', credentialId);
      if (s.conflicts > 0) openConflictModal('onenote', credentialId, 'OneNote');
      onImported?.();
    } else {
      setMsg(credentialId, res.error ?? 'Falha ao sincronizar.');
    }
    setBusyId(null);
  }, [onImported, setMsg, openConflictModal, refreshConflictCount]);

  const handleDisconnectOneNote = useCallback(async (credentialId: string) => {
    if (!window.confirm('Desconectar esta conta do OneNote? As notas já importadas continuam no seu vault.')) return;
    await disconnectOneNote(credentialId);
    await loadOneNote();
  }, [loadOneNote]);

  if (!isOpen) return null;

  const border = d ? 'border-gray-700' : 'border-gray-200';
  const cardBorder = d ? 'border-gray-800' : 'border-gray-200';
  const secondaryBtn = `text-xs px-2 py-1 rounded border transition-colors disabled:opacity-40 ${d ? 'border-gray-700 text-gray-300 hover:border-gray-500' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`;
  const primaryBtn = `text-xs px-2 py-1 rounded transition-colors disabled:opacity-40 ${d ? 'bg-indigo-700 hover:bg-indigo-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`;

  return (
    <>
      <Script src="https://apis.google.com/js/api.js" strategy="lazyOnload" onLoad={() => window.gapi?.load('picker', () => setPickerReady(true))} />
      <Script src="https://accounts.google.com/gsi/client" strategy="lazyOnload" onLoad={() => setGisReady(true)} />

      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className={`rounded-xl shadow-xl w-full max-w-xl max-h-[85dvh] flex flex-col ${d ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
          <div className={`px-5 py-4 border-b flex items-center justify-between ${border}`}>
            <div className={`text-sm font-semibold ${d ? 'text-gray-100' : 'text-gray-900'}`}>Conexões externas</div>
            <button onClick={onClose} className={`p-1 rounded transition-colors ${d ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}>✕</button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {googleConfigured && (
              <div className="space-y-2">
                <div className={`text-xs font-semibold ${d ? 'text-gray-500' : 'text-gray-400'}`}>Google Drive</div>
                {googleConnections.map(conn => (
                  <div key={conn.credentialId} className={`rounded-lg border px-3 py-2.5 space-y-1.5 ${cardBorder}`}>
                    <div className={`text-xs ${d ? 'text-gray-400' : 'text-gray-600'}`}>{formatSync(conn)}</div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => openPicker(conn.credentialId)} disabled={busyId !== null || !pickerReady || !gisReady} className={primaryBtn}>
                        {!pickerReady || !gisReady ? 'Carregando…' : busyId === conn.credentialId ? 'Importando…' : 'Selecionar e importar'}
                      </button>
                      <button onClick={() => handleResyncGoogle(conn.credentialId)} disabled={busyId !== null} className={secondaryBtn}>Sincronizar</button>
                      <button onClick={() => handleDisconnectGoogle(conn.credentialId)} className={`text-xs px-2 py-1 ${d ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}>Desconectar</button>
                    </div>
                    {(conflictCounts[conn.credentialId] ?? 0) > 0 && (
                      <button
                        onClick={() => openConflictModal('google_drive', conn.credentialId, 'Google Drive')}
                        className={`w-full text-left rounded border px-2 py-1.5 text-xs font-medium transition-colors ${d ? 'border-yellow-900/50 bg-yellow-900/10 text-yellow-500 hover:bg-yellow-900/20' : 'border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100'}`}
                      >
                        ⚠ {conflictCounts[conn.credentialId]} nota(s) com atualização pendente — revisar
                      </button>
                    )}
                    {messages[conn.credentialId] && <div className={`text-xs ${d ? 'text-gray-400' : 'text-gray-500'}`}>{messages[conn.credentialId]}</div>}
                    {conn.lastError && <div className="text-xs text-red-500">{conn.lastError}</div>}
                  </div>
                ))}
                <a href="/api/notes-connectors/google_drive/connect" className={`inline-block ${secondaryBtn}`}>
                  {googleConnections.length === 0 ? 'Connect Google Drive' : '+ Conectar outra conta'}
                </a>
              </div>
            )}

            {oneNoteConfigured && (
              <div className="space-y-2">
                <div className={`text-xs font-semibold ${d ? 'text-gray-500' : 'text-gray-400'}`}>OneNote</div>
                {oneNoteConnections.map(conn => (
                  <div key={conn.credentialId} className={`rounded-lg border px-3 py-2.5 space-y-1.5 ${cardBorder}`}>
                    <div className={`text-xs ${d ? 'text-gray-400' : 'text-gray-600'}`}>{formatSync(conn)}</div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => handleOpenOneNoteSelection(conn.credentialId)} disabled={busyId !== null} className={primaryBtn}>
                        Selecionar e importar
                      </button>
                      <button onClick={() => handleResyncOneNote(conn.credentialId)} disabled={busyId !== null} className={secondaryBtn}>Sincronizar</button>
                      <button onClick={() => handleDisconnectOneNote(conn.credentialId)} className={`text-xs px-2 py-1 ${d ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}>Desconectar</button>
                    </div>
                    {(conflictCounts[conn.credentialId] ?? 0) > 0 && (
                      <button
                        onClick={() => openConflictModal('onenote', conn.credentialId, 'OneNote')}
                        className={`w-full text-left rounded border px-2 py-1.5 text-xs font-medium transition-colors ${d ? 'border-yellow-900/50 bg-yellow-900/10 text-yellow-500 hover:bg-yellow-900/20' : 'border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100'}`}
                      >
                        ⚠ {conflictCounts[conn.credentialId]} nota(s) com atualização pendente — revisar
                      </button>
                    )}
                    {messages[conn.credentialId] && <div className={`text-xs ${d ? 'text-gray-400' : 'text-gray-500'}`}>{messages[conn.credentialId]}</div>}
                    {conn.lastError && <div className="text-xs text-red-500">{conn.lastError}</div>}
                  </div>
                ))}
                <a href="/api/notes-connectors/onenote/connect" className={`inline-block ${secondaryBtn}`}>
                  {oneNoteConnections.length === 0 ? 'Connect OneNote' : '+ Conectar outra conta'}
                </a>
              </div>
            )}

            {!googleConfigured && !oneNoteConfigured && (
              <div className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>Nenhum conector externo configurado neste servidor.</div>
            )}
          </div>
        </div>
      </div>

      <ConnectorConflictModal
        isDarkMode={d}
        isOpen={conflictTarget !== null}
        providerLabel={conflictTarget?.label ?? ''}
        conflicts={conflicts}
        resolvingId={resolvingId}
        message={null}
        onResolve={handleResolveConflict}
        onClose={() => setConflictTarget(null)}
      />

      <OneNoteSelectionModal
        isDarkMode={d}
        isOpen={oneNoteSelectionFor !== null}
        loading={oneNoteItemsLoading}
        items={oneNoteItemsList}
        importing={busyId === oneNoteSelectionFor}
        onImport={handleImportOneNote}
        onClose={() => setOneNoteSelectionFor(null)}
      />
    </>
  );
}
