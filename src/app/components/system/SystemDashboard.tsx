'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import BenchmarkPanel from './BenchmarkPanel';
import GarminSettings from '../settings/GarminSettings';
import InstagramSettings from '../settings/InstagramSettings';
import SystemTab from './SystemTab';
import ApiKeysTab from './ApiKeysTab';
import PreferencesTab from './PreferencesTab';
import { Model } from '@/app/types';

interface SystemDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  userId?: string;
  initialTab?: 'preferences' | 'system' | 'apiKeys' | 'health' | 'benchmark' | 'social';
  MODELS?: Model[];
  selectedModel?: string;
  setSelectedModel: (modelId: string) => void;
  githubToken: string;
  tavilyApiKey: string;
  googleApiKey: string;
  anthropicApiKey: string;
  tokenInput: string;
  setTokenInput: (v: string) => void;
  tavilyKeyInput: string;
  setTavilyKeyInput: (v: string) => void;
  googleKeyInput: string;
  setGoogleKeyInput: (v: string) => void;
  anthropicKeyInput: string;
  setAnthropicKeyInput: (v: string) => void;
  locationInput: string;
  setLocationInput: (v: string) => void;
  onSaveToken: () => Promise<void>;
  onOpenTelegramSettings?: () => void;
  userName?: string;
  userEmail?: string;
}

const TABS = [
  { id: 'preferences' as const, label: 'preferences' },
  { id: 'apiKeys'     as const, label: 'api-keys'    },
  { id: 'health'      as const, label: 'health'      },
  { id: 'social'      as const, label: 'social'      },
  { id: 'system'      as const, label: 'system'      },
  { id: 'benchmark'   as const, label: 'benchmark'   },
];

export default function SystemDashboardModal({
  isOpen,
  onClose,
  isDarkMode,
  userId,
  initialTab = 'preferences',
  githubToken,
  tavilyApiKey,
  googleApiKey,
  anthropicApiKey,
  tokenInput,
  setTokenInput,
  tavilyKeyInput,
  setTavilyKeyInput,
  googleKeyInput,
  setGoogleKeyInput,
  anthropicKeyInput,
  setAnthropicKeyInput,
  locationInput,
  setLocationInput,
  onSaveToken,
  onOpenTelegramSettings,
  MODELS = [],
  selectedModel = '',
  setSelectedModel,
  userName,
  userEmail,
}: SystemDashboardProps) {
  const t = useTranslations('system');
  const [activeTab, setActiveTab] = useState<'system' | 'apiKeys' | 'preferences' | 'health' | 'benchmark' | 'social'>(initialTab ?? 'preferences');
  const [retroMode, setRetroMode] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('cfg-retro') !== 'off' : true
  );
  const [isSavingKeys, setIsSavingKeys] = useState(false);
  const [keySaveMessage, setKeySaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const toggleRetro = () => setRetroMode(prev => {
    const next = !prev;
    localStorage.setItem('cfg-retro', next ? 'on' : 'off');
    return next;
  });

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab ?? 'preferences');
  }, [isOpen]);

  useEffect(() => {
    if (!keySaveMessage) return;
    const timer = setTimeout(() => setKeySaveMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [keySaveMessage]);

  const handleSaveApiKeys = async () => {
    setIsSavingKeys(true);
    setKeySaveMessage(null);
    try {
      await onSaveToken();
      setKeySaveMessage({ type: 'success', text: t('keysSaved') });
    } catch {
      setKeySaveMessage({ type: 'error', text: t('keysSaveFailed') });
    } finally {
      setIsSavingKeys(false);
    }
  };

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <>
      <style>{`
        .allerac-cfg {
          font-family: 'Courier New', Courier, monospace;
          color: #c9d1d9;
        }
        .allerac-cfg label {
          color: #8b949e !important;
          font-size: 0.72rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-weight: 600;
        }
        .allerac-cfg input:not([type=range]),
        .allerac-cfg textarea,
        .allerac-cfg select {
          background: #161b22 !important;
          border: 1px solid #30363d !important;
          color: #c9d1d9 !important;
          border-radius: 4px !important;
          font-family: inherit !important;
          font-size: 0.82rem !important;
        }
        .allerac-cfg input:focus,
        .allerac-cfg textarea:focus,
        .allerac-cfg select:focus {
          border-color: #818cf8 !important;
          outline: none !important;
          box-shadow: 0 0 0 1px #818cf820 !important;
        }
        .allerac-cfg input::placeholder,
        .allerac-cfg textarea::placeholder {
          color: #484f58 !important;
        }
        .allerac-cfg p.hint {
          color: #8b949e;
          font-size: 0.72rem;
          margin-top: 6px;
        }
        .allerac-cfg hr, .allerac-cfg [class*="border-b"], .allerac-cfg [class*="border-t"] {
          border-color: #21262d !important;
        }
        .allerac-cfg h3 {
          color: #8b949e !important;
          font-size: 0.72rem !important;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 700;
        }
        .allerac-cfg [class*="bg-gray-700"], .allerac-cfg [class*="bg-gray-700/50"] {
          background-color: #161b22 !important;
        }
        .allerac-cfg [class*="bg-gray-600/50"] {
          background-color: #21262d !important;
        }
        .allerac-cfg [class*="text-gray-100"], .allerac-cfg [class*="text-gray-200"] {
          color: #e6edf3 !important;
        }
        .allerac-cfg [class*="text-gray-300"] {
          color: #c9d1d9 !important;
        }
        .allerac-cfg [class*="text-gray-400"], .allerac-cfg [class*="text-gray-500"] {
          color: #8b949e !important;
        }
        .allerac-cfg [class*="rounded-lg"], .allerac-cfg [class*="rounded-md"] {
          border-radius: 4px !important;
        }
        .allerac-cfg [class*="rounded-full"] {
          border-radius: 2px !important;
        }
        .allerac-cfg [class*="bg-green-900"] { background-color: #0a2218 !important; }
        .allerac-cfg [class*="text-green-300"], .allerac-cfg [class*="text-green-400"] { color: #3fb950 !important; }
        .allerac-cfg [class*="bg-red-900"] { background-color: #2a0a0a !important; }
        .allerac-cfg [class*="text-red-300"], .allerac-cfg [class*="text-red-400"] { color: #f85149 !important; }
        .allerac-cfg [class*="text-brand-400"], .allerac-cfg [class*="text-brand-500"] { color: #818cf8 !important; }
        .allerac-cfg [class*="bg-brand-900"], .allerac-cfg [class*="bg-brand-600"],
        .allerac-cfg [class*="bg-brand-700"], .allerac-cfg [class*="bg-indigo"] {
          background-color: #1e1b4b !important;
          color: #818cf8 !important;
        }
        .allerac-cfg a { color: #818cf8 !important; }
        .allerac-cfg [class*="border-brand"] { border-color: #818cf8 !important; }
        .allerac-cfg [class*="animate-spin"] { border-bottom-color: #818cf8 !important; }
        .allerac-cfg [class*="bg-gray-50"] { background-color: #161b22 !important; }
        .allerac-cfg [class*="bg-gray-100"] { background-color: #21262d !important; }
        .allerac-cfg [class*="bg-gray-200"] { background-color: #30363d !important; }
        .allerac-cfg [class*="bg-white"] { background-color: #0d0d0d !important; }
        .allerac-cfg [class*="text-gray-900"] { color: #e6edf3 !important; }
        .allerac-cfg [class*="text-gray-800"] { color: #c9d1d9 !important; }
        .allerac-cfg [class*="text-gray-700"] { color: #8b949e !important; }
        .allerac-cfg [class*="text-gray-600"] { color: #8b949e !important; }
        .allerac-cfg [class*="border-gray-200"] { border-color: #21262d !important; }
        .allerac-cfg [class*="border-gray-300"] { border-color: #30363d !important; }
        .allerac-cfg [class*="bg-green-50"] { background-color: #0a2218 !important; }
        .allerac-cfg [class*="text-green-700"] { color: #3fb950 !important; }
        .allerac-cfg [class*="bg-red-50"] { background-color: #2a0a0a !important; }
        .allerac-cfg [class*="text-red-600"] { color: #f85149 !important; }
        .allerac-cfg [class*="text-brand-600"] { color: #818cf8 !important; }
        .allerac-cfg [class*="border-brand-600"] { border-color: #818cf8 !important; }
        .allerac-cfg [class*="hover:bg-gray-100"]:hover { background-color: #21262d !important; }
        .allerac-cfg [class*="hover:bg-gray-200"]:hover { background-color: #30363d !important; }
      `}</style>

      <div
        className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 sm:p-4"
        onClick={handleBackdropClick}
      >
        <div
          className={`${retroMode ? 'allerac-cfg' : `backdrop-blur-md ${isDarkMode ? 'bg-gray-800/95 border-t sm:border border-gray-700' : 'bg-white/95 border-t sm:border border-gray-200'}`} w-full sm:max-w-4xl rounded-t-sm sm:rounded max-h-[95dvh] sm:max-h-[90dvh] overflow-hidden shadow-2xl`}
          style={retroMode ? { background: '#0d0d0d', border: '1px solid #30363d' } : undefined}
        >
          {/* Mobile drag indicator */}
          <div className="flex justify-center pt-2 sm:hidden">
            {retroMode
              ? <div style={{ width: 32, height: 3, background: '#30363d', borderRadius: 2 }} />
              : <div className={`w-10 h-1 rounded-full ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} />
            }
          </div>

          {/* Header */}
          {retroMode ? (
            <div style={{ borderBottom: '1px solid #21262d', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#818cf8', fontSize: '0.75rem' }}>▸</span>
                <span style={{ color: '#e6edf3', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.06em' }}>{t('title')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={toggleRetro} title="Switch to modern UI"
                  style={{ background: 'none', border: 'none', color: '#484f58', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit', padding: '2px 6px' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#8b949e')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#484f58')}
                >[modern]</button>
                <button onClick={onClose}
                  style={{ background: 'none', border: 'none', color: '#484f58', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit', padding: '2px 8px' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#f85149')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#484f58')}
                >[×]</button>
              </div>
            </div>
          ) : (
            <div className={`px-4 py-3 sm:p-4 border-b flex items-center justify-between ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-brand-400 to-brand-700 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h2 className={`text-base sm:text-lg font-semibold truncate ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{t('title')}</h2>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <button onClick={toggleRetro} title="Switch to retro UI"
                  className={`px-2 py-1 rounded text-xs transition-colors ${isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
                >retro</button>
                <button onClick={onClose}
                  className={`p-1.5 sm:p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Tabs */}
          {retroMode ? (
            <div style={{ borderBottom: '1px solid #21262d', padding: '0 20px', display: 'flex', overflowX: 'auto' }}>
              {TABS.map(tab => {
                const active = activeTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    style={{
                      background: 'none', border: 'none',
                      borderBottom: active ? '1px solid #818cf8' : '1px solid transparent',
                      color: active ? '#818cf8' : '#484f58',
                      cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: '0.72rem', letterSpacing: '0.05em',
                      padding: '10px 14px', whiteSpace: 'nowrap',
                      transition: 'color 0.15s', marginBottom: -1,
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#8b949e'; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#484f58'; }}
                  >{active ? `[${tab.label}]` : tab.label}</button>
                );
              })}
            </div>
          ) : (
            <div className={`flex overflow-x-auto border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                    activeTab === tab.id
                      ? isDarkMode ? 'border-brand-400 text-brand-400' : 'border-brand-600 text-brand-600'
                      : isDarkMode ? 'border-transparent text-gray-400 hover:text-gray-200' : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >{tab.label}</button>
              ))}
            </div>
          )}

          {/* Tab content */}
          <div className={`${retroMode ? 'p-3 sm:p-5' : 'p-3 sm:p-4'} overflow-y-auto max-h-[calc(95dvh-120px)] sm:max-h-[calc(90dvh-140px)]`}
            style={retroMode ? { color: '#c9d1d9' } : undefined}
          >
            {activeTab === 'system' && (
              <SystemTab isDarkMode={retroMode || isDarkMode} userId={userId} />
            )}

            {activeTab === 'apiKeys' && (
              <ApiKeysTab
                isDarkMode={retroMode || isDarkMode}
                githubToken={githubToken}
                tavilyApiKey={tavilyApiKey}
                googleApiKey={googleApiKey}
                anthropicApiKey={anthropicApiKey}
                tokenInput={tokenInput}
                setTokenInput={setTokenInput}
                tavilyKeyInput={tavilyKeyInput}
                setTavilyKeyInput={setTavilyKeyInput}
                googleKeyInput={googleKeyInput}
                setGoogleKeyInput={setGoogleKeyInput}
                anthropicKeyInput={anthropicKeyInput}
                setAnthropicKeyInput={setAnthropicKeyInput}
                onSave={handleSaveApiKeys}
                isSavingKeys={isSavingKeys}
                keySaveMessage={keySaveMessage}
              />
            )}

            {activeTab === 'preferences' && (
              <PreferencesTab
                isDarkMode={retroMode || isDarkMode}
                MODELS={MODELS}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                locationInput={locationInput}
                setLocationInput={setLocationInput}
                onOpenTelegramSettings={onOpenTelegramSettings}
                onSave={handleSaveApiKeys}
                isSavingKeys={isSavingKeys}
                keySaveMessage={keySaveMessage}
                userName={userName}
                userEmail={userEmail}
              />
            )}

            {activeTab === 'health' && (
              <GarminSettings userId={userId} isDarkMode={retroMode || isDarkMode} />
            )}

            {activeTab === 'social' && (
              <InstagramSettings userId={userId} isDarkMode={retroMode || isDarkMode} />
            )}

            {activeTab === 'benchmark' && (
              <BenchmarkPanel
                isDarkMode={retroMode || isDarkMode}
                userId={userId}
                MODELS={MODELS}
                selectedModel={selectedModel}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
