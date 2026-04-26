'use client';

import { useEffect, useState } from 'react';

interface TokenConfigurationProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  githubToken: string;
  tavilyApiKey: string;
  telegramBotToken: string;
  anthropicApiKey: string;
  tokenInput: string;
  setTokenInput: (value: string) => void;
  tavilyKeyInput: string;
  setTavilyKeyInput: (value: string) => void;
  telegramBotTokenInput: string;
  setTelegramBotTokenInput: (value: string) => void;
  anthropicApiKeyInput: string;
  setAnthropicApiKeyInput: (value: string) => void;
  locationInput: string;
  setLocationInput: (value: string) => void;
  onSave: () => void;
}

export default function TokenConfiguration({
  isOpen,
  onClose,
  isDarkMode,
  githubToken,
  tavilyApiKey,
  telegramBotToken,
  anthropicApiKey,
  tokenInput,
  setTokenInput,
  tavilyKeyInput,
  setTavilyKeyInput,
  telegramBotTokenInput,
  setTelegramBotTokenInput,
  anthropicApiKeyInput,
  setAnthropicApiKeyInput,
  locationInput,
  setLocationInput,
  onSave
}: TokenConfigurationProps) {
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  async function detectLocation() {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }
    setDetectingLocation(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: { 'Accept-Language': 'en' } }
          );
          const data = await res.json();
          const city = data.address?.city || data.address?.town || data.address?.village || data.address?.county || '';
          const country = data.address?.country || '';
          setLocationInput(city && country ? `${city}, ${country}` : city || country || `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`);
        } catch {
          setLocationError('Could not resolve your location. Please enter it manually.');
        } finally {
          setDetectingLocation(false);
        }
      },
      () => {
        setLocationError('Location access denied. Please enter your city manually.');
        setDetectingLocation(false);
      }
    );
  }
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.3)' }}>
      <div className={`rounded-lg shadow-xl p-6 w-full max-w-md ${isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
        <h2 className={`text-2xl font-bold mb-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Configure API Keys</h2>
        <div className="space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Allerac API Key
            </label>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder={githubToken ? '••••••••' : 'Enter your Allerac API key...'}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
            />
            <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Your API key unlocks Pro models (GPT-4o, Ministral, Gemini). Contact Allerac to get yours.
            </p>
          </div>
          
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Tavily API Key (Optional - for web search)
            </label>
            <input
              type="password"
              value={tavilyKeyInput}
              onChange={(e) => setTavilyKeyInput(e.target.value)}
              placeholder={tavilyApiKey ? '••••••••' : 'tvly-...'}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
            />
            <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Get a free API key at{' '}
              <a
                href="https://app.tavily.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline"
              >
                tavily.com
              </a>
              {' '}to enable web search capabilities
            </p>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Anthropic API Key (Optional - for Claude models)
            </label>
            <input
              type="password"
              value={anthropicApiKeyInput}
              onChange={(e) => setAnthropicApiKeyInput(e.target.value)}
              placeholder={anthropicApiKey ? '••••••••' : 'sk-ant-...'}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
            />
            <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Get an API key at{' '}
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline"
              >
                console.anthropic.com
              </a>
              {' '}to use Claude models (Haiku, Sonnet, Opus)
            </p>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Google Models API Key (Optional - for Gemini models)
            </label>
            <input
              type="password"
              placeholder="Enter your Google API key..."
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
            />
            <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Get an API key at{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline"
              >
                aistudio.google.com
              </a>
              {' '}to use Google Models (Gemini)
            </p>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Telegram Bot Token (Optional - for Telegram access)
            </label>
            <input
              type="password"
              value={telegramBotTokenInput}
              onChange={(e) => setTelegramBotTokenInput(e.target.value)}
              placeholder={telegramBotToken ? '••••••••' : 'Enter bot token...'}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
            />
            <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Create a bot via{' '}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline"
              >
                @BotFather
              </a>
              {' '}on Telegram to get your token
            </p>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Your Location (Optional - for weather and local context)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={locationInput}
                onChange={(e) => { setLocationInput(e.target.value); setLocationError(null); }}
                placeholder="e.g. Lisbon, Portugal"
                className={`flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
              />
              <button
                onClick={detectLocation}
                disabled={detectingLocation}
                title="Detect my location"
                className={`px-3 py-2 rounded-md border transition-colors disabled:opacity-50 ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600' : 'border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
              >
                {detectingLocation ? (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
            {locationError && <p className="text-xs mt-1 text-red-500">{locationError}</p>}
            {!locationError && <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Used to answer questions like "what&apos;s the weather here?". Click 📍 to detect automatically.
            </p>}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onSave}
              disabled={!tokenInput.trim() && !tavilyKeyInput.trim() && !telegramBotTokenInput.trim() && !anthropicApiKeyInput.trim() && !locationInput.trim()}
              className="flex-1 px-4 py-2 bg-brand-900 text-white rounded-md hover:bg-brand-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Save Keys
            </button>
            <button
              onClick={onClose}
              className={`flex-1 px-4 py-2 rounded-md transition-colors ${isDarkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'}`}
            >
              {githubToken || telegramBotToken ? 'Cancel' : 'Skip for Now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
