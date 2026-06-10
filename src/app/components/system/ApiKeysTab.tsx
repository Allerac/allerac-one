'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import ApiKeyField from '@/app/components/settings/ApiKeyField';
import {
  clearGoogleApiKey,
  loadUserSettings,
  setGoogleKeyPreference,
} from '@/app/actions/user';

interface ApiKeysTabProps {
  isDarkMode: boolean;
  githubToken: string;
  tavilyApiKey: string;
  googleApiKey: string;
  setGoogleApiKey: (v: string) => void;
  anthropicApiKey: string;
  tokenInput: string;
  setTokenInput: (v: string) => void;
  tavilyKeyInput: string;
  setTavilyKeyInput: (v: string) => void;
  googleKeyInput: string;
  setGoogleKeyInput: (v: string) => void;
  anthropicKeyInput: string;
  setAnthropicKeyInput: (v: string) => void;
  onSave: () => Promise<void>;
  isSavingKeys: boolean;
  keySaveMessage: { type: 'success' | 'error'; text: string } | null;
}

export default function ApiKeysTab({
  isDarkMode,
  githubToken,
  tavilyApiKey,
  googleApiKey,
  setGoogleApiKey,
  anthropicApiKey,
  tokenInput,
  setTokenInput,
  tavilyKeyInput,
  setTavilyKeyInput,
  googleKeyInput,
  setGoogleKeyInput,
  anthropicKeyInput,
  setAnthropicKeyInput,
  onSave,
  isSavingKeys,
  keySaveMessage,
}: ApiKeysTabProps) {
  const t = useTranslations('system');
  const [googlePreference, setGooglePreference] = useState<'personal' | 'allerac'>('personal');
  const [googlePreferencePending, setGooglePreferencePending] = useState(false);

  useEffect(() => {
    loadUserSettings()
      .then(settings => {
        setGooglePreference(settings?.google_key_preference === 'allerac' ? 'allerac' : 'personal');
      })
      .catch(() => {});
  }, []);

  const updateGooglePreference = async (preference: 'personal' | 'allerac') => {
    setGooglePreferencePending(true);
    try {
      const result = await setGoogleKeyPreference(preference);
      if (result.success) setGooglePreference(preference);
    } finally {
      setGooglePreferencePending(false);
    }
  };

  const removeGoogleKey = async () => {
    setGooglePreferencePending(true);
    try {
      const result = await clearGoogleApiKey();
      if (result.success) {
        setGoogleApiKey('');
        setGoogleKeyInput('');
        setGooglePreference('allerac');
      }
    } finally {
      setGooglePreferencePending(false);
    }
  };

  const saveKeys = async () => {
    const savesPersonalGoogleKey = googleKeyInput.trim().length > 0;
    await onSave();
    if (savesPersonalGoogleKey) setGooglePreference('personal');
  };

  return (
    <div className="space-y-5">
      <ApiKeyField
        label="Allerac API Key"
        description="(Pro models: GPT-4o, Ministral, Gemini)"
        placeholder="Enter your Allerac API key..."
        provider="github"
        hasStoredValue={!!githubToken}
        value={tokenInput}
        onChange={setTokenInput}
        isDarkMode={isDarkMode}
        helpText="Contact Allerac to get your key."
      />

      <ApiKeyField
        label="Tavily API Key"
        description="(optional — web search)"
        placeholder="tvly-..."
        provider="tavily"
        hasStoredValue={!!tavilyApiKey}
        value={tavilyKeyInput}
        onChange={setTavilyKeyInput}
        isDarkMode={isDarkMode}
        helpUrl="https://app.tavily.com"
        helpText="Get a free key at "
      />

      <ApiKeyField
        label={t('googleApiKey')}
        description="(optional — Gemini models)"
        placeholder={t('googleApiKeyPlaceholder')}
        provider="google"
        hasStoredValue={!!googleApiKey}
        value={googleKeyInput}
        onChange={setGoogleKeyInput}
        isDarkMode={isDarkMode}
        helpUrl="https://aistudio.google.com/apikey"
        helpText={t('googleApiKeyHint') + ' '}
      />

      <div className={`rounded-lg border p-3 space-y-3 ${
        isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
      }`}>
        <div>
          <p className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            {t('googleKeyUsage')}
          </p>
          <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('googleKeyUsageHint')}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={googlePreferencePending || !googleApiKey}
            onClick={() => updateGooglePreference('personal')}
            className={`text-left rounded-md border p-3 transition-colors disabled:opacity-50 ${
              googlePreference === 'personal'
                ? 'border-brand-500 bg-brand-500/10'
                : isDarkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-white'
            }`}
          >
            <span className="block text-sm font-medium">{t('usePersonalGoogleKey')}</span>
            <span className={`block text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('personalGoogleKeyHint')}
            </span>
          </button>
          <button
            type="button"
            disabled={googlePreferencePending}
            onClick={() => updateGooglePreference('allerac')}
            className={`text-left rounded-md border p-3 transition-colors disabled:opacity-50 ${
              googlePreference === 'allerac'
                ? 'border-brand-500 bg-brand-500/10'
                : isDarkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-white'
            }`}
          >
            <span className="block text-sm font-medium">{t('useAlleracGoogleKey')}</span>
            <span className={`block text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('alleracGoogleKeyHint')}
            </span>
          </button>
        </div>
        {googleApiKey && (
          <button
            type="button"
            disabled={googlePreferencePending}
            onClick={removeGoogleKey}
            className="text-xs font-medium text-red-500 hover:text-red-400 disabled:opacity-50"
          >
            {t('removePersonalGoogleKey')}
          </button>
        )}
      </div>

      <ApiKeyField
        label="Anthropic API Key"
        description="(optional — Claude models)"
        placeholder="sk-ant-..."
        provider="anthropic"
        hasStoredValue={!!anthropicApiKey}
        value={anthropicKeyInput}
        onChange={setAnthropicKeyInput}
        isDarkMode={isDarkMode}
        helpUrl="https://console.anthropic.com"
        helpText="Get a key at "
      />

      {keySaveMessage && (
        <div className={`p-2.5 rounded-lg text-sm ${
          keySaveMessage.type === 'success'
            ? isDarkMode ? 'bg-green-900/30 text-green-300' : 'bg-green-50 text-green-700'
            : isDarkMode ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'
        }`}>
          {keySaveMessage.text}
        </div>
      )}

      <button
        onClick={saveKeys}
        disabled={isSavingKeys || (!tokenInput.trim() && !tavilyKeyInput.trim() && !googleKeyInput.trim() && !anthropicKeyInput.trim())}
        className="px-5 py-2 bg-brand-900 text-white rounded-md hover:bg-brand-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
      >
        {isSavingKeys && <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />}
        {t('saveKeys')}
      </button>
    </div>
  );
}
