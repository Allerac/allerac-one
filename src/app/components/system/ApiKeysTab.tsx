'use client';

import { useTranslations } from 'next-intl';
import ApiKeyField from '@/app/components/settings/ApiKeyField';

interface ApiKeysTabProps {
  isDarkMode: boolean;
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
  onSave: () => Promise<void>;
  isSavingKeys: boolean;
  keySaveMessage: { type: 'success' | 'error'; text: string } | null;
}

export default function ApiKeysTab({
  isDarkMode,
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
  onSave,
  isSavingKeys,
  keySaveMessage,
}: ApiKeysTabProps) {
  const t = useTranslations('system');

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
        onClick={onSave}
        disabled={isSavingKeys || (!tokenInput.trim() && !tavilyKeyInput.trim() && !googleKeyInput.trim() && !anthropicKeyInput.trim())}
        className="px-5 py-2 bg-brand-900 text-white rounded-md hover:bg-brand-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
      >
        {isSavingKeys && <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />}
        {t('saveKeys')}
      </button>
    </div>
  );
}
