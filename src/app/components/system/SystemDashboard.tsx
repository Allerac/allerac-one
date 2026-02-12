'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import * as systemActions from '@/app/actions/system';
import * as updateActions from '@/app/actions/updates';
import * as backupActions from '@/app/actions/backup';

interface SystemDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

interface SystemDashboard {
  system: {
    hostname: string;
    platform: string;
    arch: string;
    uptime: number;
    nodeVersion: string;
  };
  memory: {
    total: number;
    free: number;
    used: number;
    usedPercent: number;
  };
  cpu: {
    cores: number;
    model: string;
    loadAvg: number[];
  };
  ollama: {
    connected: boolean;
    version?: string;
    models: Array<{
      name: string;
      size: number;
      modified_at: string;
    }>;
    error?: string;
  };
  database: {
    connected: boolean;
    version?: string;
    tables: {
      users: number;
      conversations: number;
      messages: number;
      memories: number;
      documents: number;
    };
    error?: string;
  };
  timestamp: string;
}

interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  latestRelease: {
    tag_name: string;
    name: string;
    body: string;
    published_at: string;
    html_url: string;
  } | null;
  updateAvailable: boolean;
  error?: string;
}

interface BackupInfo {
  filename: string;
  path: string;
  size: number;
  sizeFormatted: string;
  createdAt: Date;
  createdAtFormatted: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export default function SystemDashboardModal({ isOpen, onClose, isDarkMode }: SystemDashboardProps) {
  const t = useTranslations('system');
  const [data, setData] = useState<SystemDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  // Backup state
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tBackup = useTranslations('backup');

  useEffect(() => {
    if (isOpen) {
      loadDashboard();
      checkUpdates();
      loadBackups();
      // Auto-refresh every 30 seconds
      const interval = setInterval(loadDashboard, 30000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  // Auto-dismiss backup message after 4 seconds
  useEffect(() => {
    if (backupMessage) {
      const timer = setTimeout(() => {
        setBackupMessage(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [backupMessage]);

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      const dashboard = await systemActions.getSystemDashboard();
      setData(dashboard);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load system status');
    } finally {
      setIsLoading(false);
    }
  };

  const checkUpdates = async () => {
    setIsCheckingUpdates(true);
    try {
      const status = await updateActions.checkForUpdates();
      setUpdateStatus(status);
    } catch (err: any) {
      console.error('Failed to check updates:', err);
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleUpdate = async () => {
    if (!updateStatus?.latestVersion) return;

    setIsUpdating(true);
    setUpdateMessage(null);

    try {
      const result = await updateActions.applyUpdate(updateStatus.latestVersion);
      setUpdateMessage(result.message);
      if (result.success) {
        // Refresh update status after successful preparation
        await checkUpdates();
      }
    } catch (err: any) {
      setUpdateMessage(err.message || 'Update failed');
    } finally {
      setIsUpdating(false);
    }
  };

  const loadBackups = async () => {
    try {
      const list = await backupActions.listBackups();
      setBackups(list);
    } catch (err: any) {
      console.error('Failed to load backups:', err);
    }
  };

  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    setBackupMessage(null);

    try {
      const result = await backupActions.createBackup();
      if (result.success) {
        setBackupMessage({ type: 'success', text: tBackup('backupCreated') });
        await loadBackups();
      } else {
        setBackupMessage({ type: 'error', text: result.message });
      }
    } catch (err: any) {
      setBackupMessage({ type: 'error', text: err.message || tBackup('backupFailed') });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    if (!confirm(tBackup('confirmRestore'))) return;

    setIsRestoringBackup(filename);
    setBackupMessage(null);

    try {
      const result = await backupActions.restoreBackup(filename);
      if (result.success) {
        setBackupMessage({ type: 'success', text: tBackup('backupRestored') });
      } else {
        setBackupMessage({ type: 'error', text: result.message });
      }
    } catch (err: any) {
      setBackupMessage({ type: 'error', text: err.message || tBackup('restoreFailed') });
    } finally {
      setIsRestoringBackup(null);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!confirm(tBackup('confirmDelete'))) return;

    try {
      const result = await backupActions.deleteBackup(filename);
      if (result.success) {
        setBackupMessage({ type: 'success', text: tBackup('backupDeleted') });
        await loadBackups();
      } else {
        setBackupMessage({ type: 'error', text: result.message });
      }
    } catch (err: any) {
      setBackupMessage({ type: 'error', text: err.message });
    }
  };

  const handleDownloadBackup = async (filename: string) => {
    try {
      const result = await backupActions.downloadBackup(filename);
      if (result.success && result.data) {
        // Convert base64 to blob and download
        const byteCharacters = atob(result.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/sql' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        setBackupMessage({ type: 'error', text: result.message || 'Download failed' });
      }
    } catch (err: any) {
      setBackupMessage({ type: 'error', text: err.message });
    }
  };

  const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportingBackup(true);
    setBackupMessage(null);

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          // Remove data URL prefix if present
          const base64 = content.includes(',') ? content.split(',')[1] : content;

          const result = await backupActions.uploadBackup(base64, file.name);
          if (result.success) {
            setBackupMessage({ type: 'success', text: tBackup('backupImported') });
            await loadBackups();
          } else {
            setBackupMessage({ type: 'error', text: result.message });
          }
        } catch (err: any) {
          setBackupMessage({ type: 'error', text: err.message || tBackup('importFailed') });
        } finally {
          setIsImportingBackup(false);
        }
      };
      reader.onerror = () => {
        setBackupMessage({ type: 'error', text: tBackup('importFailed') });
        setIsImportingBackup(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setBackupMessage({ type: 'error', text: err.message || tBackup('importFailed') });
      setIsImportingBackup(false);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div
        className={`backdrop-blur-md rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden ${
          isDarkMode
            ? 'bg-gray-800/95 border border-gray-700'
            : 'bg-white/95 border border-gray-200'
        }`}
      >
        {/* Header */}
        <div
          className={`p-4 border-b flex items-center justify-between ${
            isDarkMode ? 'border-gray-700' : 'border-gray-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                {t('title')}
              </h2>
              {data && (
                <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {t('lastUpdated')}: {new Date(data.timestamp).toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadDashboard}
              disabled={isLoading}
              className={`p-2 rounded-lg transition-colors ${
                isDarkMode
                  ? 'hover:bg-gray-700 text-gray-400'
                  : 'hover:bg-gray-100 text-gray-500'
              }`}
            >
              <svg className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${
                isDarkMode
                  ? 'hover:bg-gray-700 text-gray-400'
                  : 'hover:bg-gray-100 text-gray-500'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
          {isLoading && !data ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
            </div>
          ) : error ? (
            <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-600'}`}>
              {error}
            </div>
          ) : data ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* System Info */}
              <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <h3 className={`text-sm font-medium mb-3 flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  {t('systemInfo')}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{t('hostname')}</span>
                    <span className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{data.system.hostname}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{t('platform')}</span>
                    <span className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{data.system.platform} ({data.system.arch})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{t('uptime')}</span>
                    <span className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{formatUptime(data.system.uptime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Node.js</span>
                    <span className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{data.system.nodeVersion}</span>
                  </div>
                </div>
              </div>

              {/* Memory */}
              <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <h3 className={`text-sm font-medium mb-3 flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m9 5.197v-1a6 6 0 00-3-5.197" />
                  </svg>
                  {t('memory')}
                </h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{t('used')}</span>
                      <span className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>
                        {formatBytes(data.memory.used)} / {formatBytes(data.memory.total)}
                      </span>
                    </div>
                    <div className={`h-2 rounded-full ${isDarkMode ? 'bg-gray-600' : 'bg-gray-200'}`}>
                      <div
                        className={`h-full rounded-full ${
                          data.memory.usedPercent > 90 ? 'bg-red-500' :
                          data.memory.usedPercent > 70 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${data.memory.usedPercent}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{t('free')}</span>
                    <span className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{formatBytes(data.memory.free)}</span>
                  </div>
                </div>
              </div>

              {/* CPU */}
              <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <h3 className={`text-sm font-medium mb-3 flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                  CPU
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{t('cores')}</span>
                    <span className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{data.cpu.cores}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{t('loadAverage')}</span>
                    <span className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>
                      {data.cpu.loadAvg.map(l => l.toFixed(2)).join(' | ')}
                    </span>
                  </div>
                  <div className={`text-xs truncate ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    {data.cpu.model}
                  </div>
                </div>
              </div>

              {/* Ollama */}
              <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <h3 className={`text-sm font-medium mb-3 flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <span className="text-lg">🦙</span>
                  Ollama
                  <span className={`ml-auto px-2 py-0.5 rounded-full text-xs ${
                    data.ollama.connected
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {data.ollama.connected ? t('connected') : t('disconnected')}
                  </span>
                </h3>
                {data.ollama.connected ? (
                  <div className="space-y-2 text-sm">
                    {data.ollama.version && (
                      <div className="flex justify-between">
                        <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{t('version')}</span>
                        <span className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{data.ollama.version}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{t('models')}</span>
                      <span className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>{data.ollama.models.length}</span>
                    </div>
                    {data.ollama.models.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {data.ollama.models.slice(0, 3).map((model) => (
                          <div key={model.name} className={`text-xs p-2 rounded ${isDarkMode ? 'bg-gray-600/50' : 'bg-gray-100'}`}>
                            <div className="flex justify-between">
                              <span className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>{model.name}</span>
                              <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{formatBytes(model.size)}</span>
                            </div>
                          </div>
                        ))}
                        {data.ollama.models.length > 3 && (
                          <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                            +{data.ollama.models.length - 3} more
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className={`text-sm ${isDarkMode ? 'text-red-400' : 'text-red-500'}`}>
                    {data.ollama.error || t('notConnected')}
                  </p>
                )}
              </div>

              {/* Database */}
              <div className={`p-4 rounded-lg md:col-span-2 ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <h3 className={`text-sm font-medium mb-3 flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                  {t('database')}
                  <span className={`ml-auto px-2 py-0.5 rounded-full text-xs ${
                    data.database.connected
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {data.database.connected ? t('connected') : t('disconnected')}
                  </span>
                </h3>
                {data.database.connected ? (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {Object.entries(data.database.tables).map(([table, count]) => (
                      <div key={table} className={`text-center p-3 rounded ${isDarkMode ? 'bg-gray-600/50' : 'bg-gray-100'}`}>
                        <div className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                          {count.toLocaleString()}
                        </div>
                        <div className={`text-xs capitalize ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {table}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={`text-sm ${isDarkMode ? 'text-red-400' : 'text-red-500'}`}>
                    {data.database.error || t('notConnected')}
                  </p>
                )}
                {data.database.version && (
                  <p className={`text-xs mt-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    {data.database.version}
                  </p>
                )}
              </div>

              {/* Updates */}
              <div className={`p-4 rounded-lg md:col-span-2 ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <h3 className={`text-sm font-medium mb-3 flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {t('updates')}
                  {updateStatus?.updateAvailable && (
                    <span className="ml-auto px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">
                      {t('updateAvailable')}
                    </span>
                  )}
                </h3>

                {isCheckingUpdates ? (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                    <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{t('checkingUpdates')}</span>
                  </div>
                ) : updateStatus ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div>
                        <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{t('currentVersion')}: </span>
                        <span className={`font-mono ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                          v{updateStatus.currentVersion}
                        </span>
                      </div>
                      {updateStatus.latestVersion && (
                        <div>
                          <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{t('latestVersion')}: </span>
                          <span className={`font-mono ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                            {updateStatus.latestVersion}
                          </span>
                        </div>
                      )}
                    </div>

                    {updateStatus.updateAvailable && updateStatus.latestRelease && (
                      <div className={`p-3 rounded-lg ${isDarkMode ? 'bg-gray-600/50' : 'bg-gray-100'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                            {updateStatus.latestRelease.name || updateStatus.latestRelease.tag_name}
                          </span>
                          <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {new Date(updateStatus.latestRelease.published_at).toLocaleDateString()}
                          </span>
                        </div>
                        {updateStatus.latestRelease.body && (
                          <p className={`text-xs whitespace-pre-wrap line-clamp-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {updateStatus.latestRelease.body}
                          </p>
                        )}
                      </div>
                    )}

                    {updateMessage && (
                      <div className={`p-3 rounded-lg text-sm ${
                        updateMessage.includes('created')
                          ? isDarkMode ? 'bg-green-900/30 text-green-300' : 'bg-green-50 text-green-700'
                          : isDarkMode ? 'bg-yellow-900/30 text-yellow-300' : 'bg-yellow-50 text-yellow-700'
                      }`}>
                        {updateMessage}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={checkUpdates}
                        disabled={isCheckingUpdates}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          isDarkMode
                            ? 'bg-gray-600 hover:bg-gray-500 text-gray-200'
                            : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                        }`}
                      >
                        {t('checkNow')}
                      </button>
                      {updateStatus.updateAvailable && (
                        <button
                          onClick={handleUpdate}
                          disabled={isUpdating}
                          className="px-3 py-1.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:bg-gray-600 flex items-center gap-2"
                        >
                          {isUpdating && (
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                          )}
                          {t('prepareUpdate')}
                        </button>
                      )}
                    </div>

                    {!updateStatus.latestVersion && (
                      <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        {t('noReleases')}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {t('updateCheckFailed')}
                  </p>
                )}
              </div>

              {/* Backups */}
              <div className={`p-4 rounded-lg md:col-span-2 ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className={`text-sm font-medium flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    {tBackup('title')}
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${isDarkMode ? 'bg-gray-600 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>
                      {backups.length}
                    </span>
                  </h3>
                  <div className="flex gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".sql"
                      onChange={handleImportBackup}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isImportingBackup}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                        isDarkMode
                          ? 'bg-gray-600 hover:bg-gray-500 text-gray-200'
                          : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                      } disabled:opacity-50`}
                    >
                      {isImportingBackup && (
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></div>
                      )}
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      {isImportingBackup ? tBackup('importing') : tBackup('import')}
                    </button>
                    <button
                      onClick={handleCreateBackup}
                      disabled={isCreatingBackup}
                      className="px-3 py-1.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:bg-gray-600 flex items-center gap-2"
                    >
                      {isCreatingBackup && (
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                      )}
                      {isCreatingBackup ? tBackup('creating') : tBackup('create')}
                    </button>
                  </div>
                </div>

                {backupMessage && (
                  <div className={`mb-3 p-2 rounded-lg text-sm ${
                    backupMessage.type === 'success'
                      ? isDarkMode ? 'bg-green-900/30 text-green-300' : 'bg-green-50 text-green-700'
                      : isDarkMode ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'
                  }`}>
                    {backupMessage.text}
                  </div>
                )}

                {backups.length === 0 ? (
                  <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {tBackup('noBackups')}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {backups.map((backup) => (
                      <div
                        key={backup.filename}
                        className={`p-3 rounded-lg flex items-center justify-between ${isDarkMode ? 'bg-gray-600/50' : 'bg-gray-100'}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                            {backup.filename}
                          </div>
                          <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {backup.sizeFormatted} • {backup.createdAtFormatted}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={() => handleDownloadBackup(backup.filename)}
                            className={`p-1.5 rounded transition-colors ${
                              isDarkMode ? 'hover:bg-gray-500 text-gray-300' : 'hover:bg-gray-200 text-gray-600'
                            }`}
                            title={tBackup('download')}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleRestoreBackup(backup.filename)}
                            disabled={isRestoringBackup === backup.filename}
                            className={`p-1.5 rounded transition-colors ${
                              isDarkMode ? 'hover:bg-gray-500 text-gray-300' : 'hover:bg-gray-200 text-gray-600'
                            }`}
                            title={tBackup('restore')}
                          >
                            {isRestoringBackup === backup.filename ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteBackup(backup.filename)}
                            className={`p-1.5 rounded transition-colors ${
                              isDarkMode ? 'hover:bg-red-900/50 text-red-400' : 'hover:bg-red-100 text-red-500'
                            }`}
                            title={tBackup('delete')}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
