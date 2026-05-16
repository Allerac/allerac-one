'use client';

import { useTranslations } from 'next-intl';

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
      <div>
        <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          Allerac API Key
        </label>
        <input
          type="password"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          placeholder={githubToken ? '••••••••' : 'Enter your Allerac API key...'}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
        />
        <p className={`text-xs mt-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Your API key unlocks Pro models (GPT-4o, Ministral, Gemini). Contact Allerac to get yours.
        </p>
      </div>

      <div>
        <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          Tavily API Key <span className={`text-xs font-normal ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>(optional — web search)</span>
        </label>
        <input
          type="password"
          value={tavilyKeyInput}
          onChange={(e) => setTavilyKeyInput(e.target.value)}
          placeholder={tavilyApiKey ? '••••••••' : 'tvly-...'}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
        />
        <p className={`text-xs mt-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Get a free key at{' '}
          <a href="https://app.tavily.com" target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:underline">
            tavily.com
          </a>
        </p>
      </div>

      <div>
        <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          {t('googleApiKey')} <span className={`text-xs font-normal ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>(optional — Gemini models)</span>
        </label>
        <input
          type="password"
          value={googleKeyInput}
          onChange={(e) => setGoogleKeyInput(e.target.value)}
          placeholder={googleApiKey ? '••••••••' : t('googleApiKeyPlaceholder')}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
        />
        <p className={`text-xs mt-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          {t('googleApiKeyHint')}
        </p>
      </div>

      <div>
        <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          Anthropic API Key <span className={`text-xs font-normal ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>(optional — Claude models)</span>
        </label>
        <input
          type="password"
          value={anthropicKeyInput}
          onChange={(e) => setAnthropicKeyInput(e.target.value)}
          placeholder={anthropicApiKey ? '••••••••' : 'sk-ant-...'}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
        />
        <p className={`text-xs mt-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Get a key at{' '}
          <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:underline">
            console.anthropic.com
          </a>
          {' '}to use Claude (Haiku, Sonnet, Opus)
        </p>
      </div>

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
        {isSavingKeys && <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>}
        {t('saveKeys')}
      </button>
    </div>
  );
}
