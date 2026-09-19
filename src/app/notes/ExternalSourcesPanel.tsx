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
  getOneNoteStatus,
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

  const [oneNoteStatus, setOneNoteStatus] = useState<ConnectorStatus | null>(null);
  const [oneNoteBusy, setOneNoteBusy] = useState<'items' | 'import' | 'sync' | null>(null);
  const [oneNoteMessage, setOneNoteMessage] = useState<string | null>(null);
  const [oneNoteItems, setOneNoteItems] = useState<OneNoteItem[]>([]);
  const [showOneNoteSelection, setShowOneNoteSelection] = useState(false);
  const [oneNoteConflicts, setOneNoteConflicts] = useState<ConflictItem[]>([]);
  const [showOneNoteConflictModal, setShowOneNoteConflictModal] = useState(false);
  const [oneNoteResolvingId, setOneNoteResolvingId] = useState<string | null>(null);

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

  const loadOneNoteStatus = useCallback(async () => {
    const res = await getOneNoteStatus();
    if (res.success && res.status) setOneNoteStatus(res.status);
  }, []);

  const loadOneNoteConflicts = useCallback(async () => {
    const res = await listOneNoteConflicts();
    if (res.success) setOneNoteConflicts(res.conflicts as ConflictItem[]);
  }, []);

  useEffect(() => { loadOneNoteStatus(); }, [loadOneNoteStatus]);
  useEffect(() => { if (oneNoteStatus?.isConnected) loadOneNoteConflicts(); }, [oneNoteStatus?.isConnected, loadOneNoteConflicts]);

  // Pick up ?connector=<provider>&status=... left by either OAuth redirect.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connector = params.get('connector');
    if (connector !== 'google_drive' && connector !== 'onenote') return;
    const outcome = params.get('status');
    const label = connector === 'google_drive' ? 'Google Drive' : 'OneNote';
    const setMsg = connector === 'google_drive' ? setMessage : setOneNoteMessage;
    if (outcome === 'connected') { setMsg(`${label} conectado.`); setExpanded(true); }
    else if (outcome === 'error') setMsg(`Falha ao conectar ao ${label}. Tente novamente.`);
    else if (outcome === 'not_configured') setMsg(`${label} não está configurado neste servidor.`);
    window.history.replaceState({}, '', window.location.pathname);
    loadStatus();
    loadOneNoteStatus();
  }, [loadStatus, loadOneNoteStatus]);

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
    //
    // setOwnedByMe(true): without it, DocsView(DOCS) shows a merged "My
    // Drive + Shared with me + Recent" corpus, producing duplicate folder
    // entries (the same folder indexed both by hierarchy and by
    // recent-activity) — confirmed fixed on real-world VM usage.
    // NOTE: setParent('root') was tried alongside this to also fix empty
    // folder contents, but it pins the view to root-level items only and
    // breaks navigating into subfolders — removed.
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setMimeTypes(PICKER_MIME_TYPES)
      .setIncludeFolders(true)
      .setOwnedByMe(true);

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

  const handleOpenOneNoteSelection = useCallback(async () => {
    setOneNoteMessage(null);
    setShowOneNoteSelection(true);
    setOneNoteBusy('items');
    const res = await getOneNoteItems();
    if (res.success) setOneNoteItems(res.items as OneNoteItem[]);
    else setOneNoteMessage(res.error ?? 'Falha ao listar notebooks.');
    setOneNoteBusy(null);
  }, []);

  const handleImportOneNote = useCallback(async (selected: OneNoteItem[]) => {
    setOneNoteBusy('import');
    const res = await importOneNoteSelection(selected);
    if (res.success && res.summary) {
      const s = res.summary;
      setOneNoteMessage(`Importado: ${s.imported} nova(s), ${s.updated} atualizada(s)${s.failed.length ? `, ${s.failed.length} falha(s)` : ''}.`);
      onImported?.();
    } else {
      setOneNoteMessage(res.error ?? 'Falha ao importar.');
    }
    setOneNoteBusy(null);
    setShowOneNoteSelection(false);
  }, [onImported]);

  const handleOneNoteResync = useCallback(async () => {
    setOneNoteBusy('sync');
    setOneNoteMessage(null);
    const res = await resyncOneNote();
    if (res.success && res.summary) {
      const s = res.summary;
      setOneNoteMessage(`Sincronizado: ${s.updated} atualizada(s), ${s.unchanged} sem mudança, ${s.conflicts} conflito(s).`);
      await loadOneNoteConflicts();
      if (s.conflicts > 0) setShowOneNoteConflictModal(true);
      onImported?.();
    } else {
      setOneNoteMessage(res.error ?? 'Falha ao sincronizar.');
    }
    setOneNoteBusy(null);
  }, [loadOneNoteConflicts, onImported]);

  const handleOneNoteResolve = useCallback(async (externalId: string, resolution: 'keep_local' | 'use_source') => {
    setOneNoteResolvingId(externalId);
    setOneNoteMessage(null);
    const resolveRes = await resolveOneNoteConflict(externalId, resolution);
    if (!resolveRes.success) {
      setOneNoteMessage(resolveRes.error ?? 'Falha ao resolver o conflito.');
      setOneNoteResolvingId(null);
      return;
    }
    const res = await listOneNoteConflicts();
    const remaining = res.success ? (res.conflicts as ConflictItem[]) : [];
    setOneNoteConflicts(remaining);
    if (remaining.length === 0) setShowOneNoteConflictModal(false);
    setOneNoteMessage(resolution === 'use_source' ? 'Atualizado com a versão da fonte.' : 'Sua versão local foi mantida.');
    setOneNoteResolvingId(null);
    onImported?.();
  }, [onImported]);

  const handleOneNoteDisconnect = useCallback(async () => {
    if (!window.confirm('Desconectar o OneNote? As notas já importadas continuam no seu vault.')) return;
    await disconnectOneNote();
    await loadOneNoteStatus();
  }, [loadOneNoteStatus]);

  // Instance has neither connector configured — nothing to show.
  if (status && !status.configured && oneNoteStatus && !oneNoteStatus.configured) return null;

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
        <span>
          External sources
          {[status?.isConnected && 'Google Drive', oneNoteStatus?.isConnected && 'OneNote'].filter(Boolean).length > 0
            && ` · ${[status?.isConnected && 'Google Drive', oneNoteStatus?.isConnected && 'OneNote'].filter(Boolean).join(', ')}`}
        </span>
        <span>{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-3">
          {status?.configured !== false && (
            <div className="space-y-2">
              <div className={`text-xs font-semibold ${d ? 'text-gray-500' : 'text-gray-400'}`}>Google Drive</div>
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

          {oneNoteStatus?.configured !== false && (
            <div className={`space-y-2 ${status?.configured !== false ? `pt-3 border-t ${d ? 'border-gray-800' : 'border-gray-200'}` : ''}`}>
              <div className={`text-xs font-semibold ${d ? 'text-gray-500' : 'text-gray-400'}`}>OneNote</div>
              {!oneNoteStatus?.isConnected ? (
                <a
                  href="/api/notes-connectors/onenote/connect"
                  className={`inline-block text-xs px-2 py-1 rounded border transition-colors ${d ? 'border-gray-700 text-gray-300 hover:border-gray-500' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
                >
                  Connect OneNote
                </a>
              ) : (
                <div className="space-y-2">
                  <div className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>
                    {oneNoteStatus.accountLabel ?? 'Connected'}
                    {oneNoteStatus.lastSyncAt && ` · synced ${new Date(oneNoteStatus.lastSyncAt).toLocaleString()}`}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleOpenOneNoteSelection}
                      disabled={oneNoteBusy !== null}
                      className={`text-xs px-2 py-1 rounded transition-colors disabled:opacity-40 ${d ? 'bg-indigo-700 hover:bg-indigo-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                    >
                      Selecionar e importar
                    </button>
                    <button
                      onClick={handleOneNoteResync}
                      disabled={oneNoteBusy !== null}
                      className={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-40 ${d ? 'border-gray-700 text-gray-300 hover:border-gray-500' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
                    >
                      {oneNoteBusy === 'sync' ? 'Sincronizando…' : 'Sincronizar'}
                    </button>
                    <button onClick={handleOneNoteDisconnect} className={`text-xs px-2 py-1 ${d ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}>
                      Desconectar
                    </button>
                  </div>

                  {oneNoteConflicts.length > 0 && (
                    <button
                      onClick={() => setShowOneNoteConflictModal(true)}
                      className={`w-full text-left rounded border px-2 py-1.5 text-xs font-medium transition-colors ${d ? 'border-yellow-900/50 bg-yellow-900/10 text-yellow-500 hover:bg-yellow-900/20' : 'border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100'}`}
                    >
                      ⚠ {oneNoteConflicts.length} nota(s) com atualização pendente — revisar
                    </button>
                  )}
                </div>
              )}

              {oneNoteMessage && <div className={`text-xs ${d ? 'text-gray-400' : 'text-gray-500'}`}>{oneNoteMessage}</div>}
              {oneNoteStatus?.lastError && <div className="text-xs text-red-500">{oneNoteStatus.lastError}</div>}
            </div>
          )}
        </div>
      )}

      <ConnectorConflictModal
        isDarkMode={d}
        isOpen={showConflictModal}
        providerLabel="Google Drive"
        conflicts={conflicts}
        resolvingId={resolvingId}
        message={message}
        onResolve={handleResolve}
        onClose={() => setShowConflictModal(false)}
      />

      <ConnectorConflictModal
        isDarkMode={d}
        isOpen={showOneNoteConflictModal}
        providerLabel="OneNote"
        conflicts={oneNoteConflicts}
        resolvingId={oneNoteResolvingId}
        message={oneNoteMessage}
        onResolve={handleOneNoteResolve}
        onClose={() => setShowOneNoteConflictModal(false)}
      />

      <OneNoteSelectionModal
        isDarkMode={d}
        isOpen={showOneNoteSelection}
        loading={oneNoteBusy === 'items'}
        items={oneNoteItems}
        importing={oneNoteBusy === 'import'}
        onImport={handleImportOneNote}
        onClose={() => setShowOneNoteSelection(false)}
      />
    </div>
  );
}
