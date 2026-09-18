'use client';

import { useState, useCallback, useEffect } from 'react';
import Script from 'next/script';
import {
  getGoogleDriveStatus,
  importGoogleDriveSelection,
  resyncGoogleDrive,
  listGoogleDriveConflicts,
  resolveGoogleDriveConflict,
  disconnectGoogleDrive,
} from '@/app/actions/notes-connectors';

interface Props {
  isDarkMode: boolean;
  onImported?: () => void;
}

interface ConnectorStatus {
  configured: boolean;
  isConnected: boolean;
  accountLabel: string | null;
  lastSyncAt: string | Date | null;
  lastError: string | null;
}

interface ConflictItem {
  externalId: string;
  noteId: string;
  sourceUrl: string;
  title: string | null;
}

// Google Picker/gapi ship no first-party types; these are the only shapes this file touches.
interface GooglePickerDocsView {
  setMimeTypes: (m: string) => GooglePickerDocsView;
  setIncludeFolders: (v: boolean) => GooglePickerDocsView;
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

const PICKER_MIME_TYPES = 'application/vnd.google-apps.document,text/plain,text/markdown';

export default function ExternalSourcesPanel({ isDarkMode: d, onImported }: Props) {
  const [status, setStatus] = useState<ConnectorStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [pickerReady, setPickerReady] = useState(false);
  const [gisReady, setGisReady] = useState(false);
  const [busy, setBusy] = useState<'import' | 'sync' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const res = await getGoogleDriveStatus();
    if (res.success && res.status) setStatus(res.status);
  }, []);

  const loadConflicts = useCallback(async () => {
    const res = await listGoogleDriveConflicts();
    if (res.success) setConflicts(res.conflicts as ConflictItem[]);
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { if (status?.isConnected) loadConflicts(); }, [status?.isConnected, loadConflicts]);

  // Pick up ?connector=google_drive&status=... left by the OAuth redirect.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connector') !== 'google_drive') return;
    const outcome = params.get('status');
    if (outcome === 'connected') { setMessage('Google Drive conectado.'); setExpanded(true); }
    else if (outcome === 'error') setMessage('Falha ao conectar ao Google Drive. Tente novamente.');
    else if (outcome === 'not_configured') setMessage('Google Drive não está configurado neste servidor.');
    window.history.replaceState({}, '', window.location.pathname);
    loadStatus();
  }, [loadStatus]);

  const launchPicker = useCallback((accessToken: string) => {
    const google = window.google;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;
    if (!google || !apiKey) {
      setMessage('Seletor do Google ainda não carregou — tente novamente em instantes.');
      return;
    }

    // drive.file only ever grants files.get access to what's picked here —
    // it never grants files.list over a folder's contents (confirmed against
    // the live API: listing a picked folder's children returns empty even
    // though the folder itself is accessible). So folders are for
    // navigation only; import individual files (multi-select works).
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setMimeTypes(PICKER_MIME_TYPES)
      .setIncludeFolders(true);

    // The numeric prefix of a Google OAuth client_id is the GCP project
    // number by convention — reused here instead of adding a separate env
    // var. setAppId is what actually registers the picked file's drive.file
    // grant against this project/app; without it the grant never attaches
    // anywhere, even with a correct token, scope, and origin (confirmed
    // while debugging Phase 2 — everything else checked out and it still
    // 404'd on import until this was added).
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

        setBusy('import');
        setMessage(`Importando ${data.docs.length} item(ns)…`);
        const importRes = await importGoogleDriveSelection(data.docs.map(doc => ({ id: doc.id, name: doc.name })), accessToken);
        if (importRes.success && importRes.summary) {
          const s = importRes.summary;
          setMessage(`Importado: ${s.imported} nova(s), ${s.updated} atualizada(s)${s.failed.length ? `, ${s.failed.length} falha(s)` : ''}.`);
          onImported?.();
        } else {
          setMessage(importRes.error ?? 'Falha ao importar.');
        }
        setBusy(null);
      })
      .build();

    picker.setVisible(true);
  }, [onImported]);

  const openPicker = useCallback(() => {
    setMessage(null);
    const google = window.google;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!google?.accounts || !clientId) {
      setMessage('Ainda carregando o Google Identity Services — tente novamente em instantes.');
      return;
    }

    // The Picker token is minted live, in the browser, via Google Identity
    // Services — NOT reused from the server-side connection. Google only
    // registers a picked file's per-file drive.file grant when the token
    // came from this exact client-side flow; a token obtained through our
    // server's stored refresh token consistently 404s on any subsequent
    // files.get, even for files the user just created (confirmed while
    // debugging Phase 2). The server-side connection is still what backs
    // status display and resync.
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: response => {
        if (!response.access_token) {
          setMessage('Não foi possível obter acesso ao Google Drive.');
          return;
        }
        launchPicker(response.access_token);
      },
    });
    tokenClient.requestAccessToken();
  }, [launchPicker]);

  const handleResync = useCallback(async () => {
    setBusy('sync');
    setMessage(null);
    const res = await resyncGoogleDrive();
    if (res.success && res.summary) {
      const s = res.summary;
      setMessage(`Sincronizado: ${s.updated} atualizada(s), ${s.unchanged} sem mudança, ${s.conflicts} conflito(s).`);
      await loadConflicts();
      if (s.conflicts > 0) setShowConflictModal(true);
      onImported?.();
    } else {
      setMessage(res.error ?? 'Falha ao sincronizar.');
    }
    setBusy(null);
  }, [loadConflicts, onImported]);

  const handleResolve = useCallback(async (externalId: string, resolution: 'keep_local' | 'use_source') => {
    setResolvingId(externalId);
    setMessage(null);
    const resolveRes = await resolveGoogleDriveConflict(externalId, resolution);
    if (!resolveRes.success) {
      setMessage(resolveRes.error ?? 'Falha ao resolver o conflito.');
      setResolvingId(null);
      return;
    }
    const res = await listGoogleDriveConflicts();
    const remaining = res.success ? (res.conflicts as ConflictItem[]) : [];
    setConflicts(remaining);
    if (remaining.length === 0) setShowConflictModal(false);
    setMessage(resolution === 'use_source' ? 'Atualizado com a versão da fonte.' : 'Sua versão local foi mantida.');
    setResolvingId(null);
    onImported?.();
  }, [onImported]);

  const handleDisconnect = useCallback(async () => {
    if (!window.confirm('Desconectar o Google Drive? As notas já importadas continuam no seu vault.')) return;
    await disconnectGoogleDrive();
    await loadStatus();
  }, [loadStatus]);

  // Instance has no Google OAuth app configured — nothing to show.
  if (status && !status.configured) return null;

  const linkClass = d ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-500';

  return (
    <div className={`flex-shrink-0 border-b px-2 py-2 ${d ? 'border-gray-800' : 'border-gray-200'}`}>
      <Script
        src="https://apis.google.com/js/api.js"
        strategy="lazyOnload"
        onLoad={() => window.gapi?.load('picker', () => setPickerReady(true))}
      />
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="lazyOnload"
        onLoad={() => setGisReady(true)}
      />
      <button
        onClick={() => setExpanded(v => !v)}
        className={`w-full flex items-center justify-between text-xs font-medium ${d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
      >
        <span>External sources{status?.isConnected ? ' · Google Drive' : ''}</span>
        <span>{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {!status?.isConnected ? (
            <a
              href="/api/notes-connectors/google_drive/connect"
              className={`inline-block text-xs px-2 py-1 rounded border transition-colors ${d ? 'border-gray-700 text-gray-300 hover:border-gray-500' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
            >
              Connect Google Drive
            </a>
          ) : (
            <div className="space-y-2">
              <div className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>
                {status.accountLabel ?? 'Connected'}
                {status.lastSyncAt && ` · synced ${new Date(status.lastSyncAt).toLocaleString()}`}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={openPicker}
                  disabled={busy !== null || !pickerReady || !gisReady}
                  className={`text-xs px-2 py-1 rounded transition-colors disabled:opacity-40 ${d ? 'bg-indigo-700 hover:bg-indigo-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                >
                  {!pickerReady || !gisReady ? 'Carregando…' : busy === 'import' ? 'Importando…' : 'Selecionar e importar'}
                </button>
                <button
                  onClick={handleResync}
                  disabled={busy !== null}
                  className={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-40 ${d ? 'border-gray-700 text-gray-300 hover:border-gray-500' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
                >
                  {busy === 'sync' ? 'Sincronizando…' : 'Sincronizar'}
                </button>
                <button onClick={handleDisconnect} className={`text-xs px-2 py-1 ${d ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}>
                  Desconectar
                </button>
              </div>

              {conflicts.length > 0 && (
                <button
                  onClick={() => setShowConflictModal(true)}
                  className={`w-full text-left rounded border px-2 py-1.5 text-xs font-medium transition-colors ${d ? 'border-yellow-900/50 bg-yellow-900/10 text-yellow-500 hover:bg-yellow-900/20' : 'border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100'}`}
                >
                  ⚠ {conflicts.length} nota(s) com atualização pendente — revisar
                </button>
              )}
            </div>
          )}

          {message && <div className={`text-xs ${d ? 'text-gray-400' : 'text-gray-500'}`}>{message}</div>}
          {status?.lastError && <div className="text-xs text-red-500">{status.lastError}</div>}
        </div>
      )}

      {showConflictModal && conflicts.length > 0 && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`rounded-xl shadow-xl w-full max-w-lg max-h-[85dvh] flex flex-col ${d ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
            <div className={`px-5 py-4 border-b ${d ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className={`text-sm font-semibold ${d ? 'text-gray-100' : 'text-gray-900'}`}>
                ⚠ Atualizações pendentes do Google Drive
              </div>
              <p className={`text-xs mt-1 ${d ? 'text-gray-400' : 'text-gray-500'}`}>
                Estas notas foram editadas aqui no Allerac e também mudaram na fonte.
                Escolha qual versão manter para cada uma — nada é sobrescrito automaticamente.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {conflicts.map(c => (
                <div key={c.externalId} className={`rounded-lg border px-3 py-3 ${d ? 'border-gray-700' : 'border-gray-200'}`}>
                  <div className={`text-sm font-medium mb-2 truncate ${d ? 'text-gray-100' : 'text-gray-900'}`}>
                    {c.title || c.externalId}
                  </div>
                  <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className={`text-xs underline ${linkClass}`}>
                    Abrir no Google Drive
                  </a>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleResolve(c.externalId, 'keep_local')}
                      disabled={resolvingId !== null}
                      className={`flex-1 text-xs px-3 py-2 rounded-lg border transition-colors disabled:opacity-40 ${d ? 'border-gray-600 text-gray-200 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                      Manter minha versão
                    </button>
                    <button
                      onClick={() => handleResolve(c.externalId, 'use_source')}
                      disabled={resolvingId !== null}
                      className={`flex-1 text-xs px-3 py-2 rounded-lg transition-colors disabled:opacity-40 ${d ? 'bg-indigo-700 hover:bg-indigo-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                    >
                      {resolvingId === c.externalId ? 'Aplicando…' : 'Usar versão da fonte'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className={`px-5 py-3 border-t flex items-center justify-between gap-3 ${d ? 'border-gray-700' : 'border-gray-200'}`}>
              {message && <span className={`text-xs ${d ? 'text-gray-400' : 'text-gray-500'}`}>{message}</span>}
              <button
                onClick={() => setShowConflictModal(false)}
                className={`text-xs px-3 py-1.5 rounded transition-colors ml-auto ${d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Revisar depois
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
