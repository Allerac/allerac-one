'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import ModelSelector from '../chat/ModelSelector';
import LanguageSelector from '@/app/components/LanguageSelector';
import { Model } from '@/app/types';

interface PreferencesTabProps {
  isDarkMode: boolean;
  MODELS: Model[];
  selectedModel: string;
  setSelectedModel: (modelId: string) => void;
  locationInput: string;
  setLocationInput: (v: string) => void;
  timezoneInput: string;
  setTimezoneInput: (v: string) => void;
  onOpenTelegramSettings?: () => void;
  onSave: () => Promise<void>;
  isSavingKeys: boolean;
  keySaveMessage: { type: 'success' | 'error'; text: string } | null;
  userName?: string;
  userEmail?: string;
}

export default function PreferencesTab({
  isDarkMode,
  MODELS,
  selectedModel,
  setSelectedModel,
  locationInput,
  setLocationInput,
  timezoneInput,
  setTimezoneInput,
  onOpenTelegramSettings,
  onSave,
  isSavingKeys,
  keySaveMessage,
  userName,
  userEmail,
}: PreferencesTabProps) {
  const locale = useLocale();
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const detectLocation = () => {
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
  };

  const initials = userName
    ? userName.slice(0, 2).toUpperCase()
    : userEmail
      ? userEmail.slice(0, 2).toUpperCase()
      : null;

  return (
    <div className="space-y-5">
      {/* User info */}
      {(userName || userEmail) && (
        <div className={`flex items-center gap-3 p-3 rounded-lg ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-100'}`}>
          {initials && (
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            {userName && (
              <p className={`text-sm font-medium truncate ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{userName}</p>
            )}
            {userEmail && (
              <p className={`text-xs truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{userEmail}</p>
            )}
          </div>
        </div>
      )}

      <div>
        <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          Your Location <span className={`text-xs font-normal ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>(optional — weather &amp; local context)</span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={locationInput}
            onChange={(e) => { setLocationInput(e.target.value); setLocationError(null); }}
            placeholder="e.g. Lisbon, Portugal"
            className={`flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
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
        {!locationError && (
          <p className={`text-xs mt-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Used to answer questions like &quot;what&apos;s the weather here?&quot;. Click the pin to detect automatically.
          </p>
        )}
      </div>

      <div>
        <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          Timezone <span className={`text-xs font-normal ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>(used by scheduled jobs)</span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={timezoneInput}
            onChange={(e) => setTimezoneInput(e.target.value)}
            placeholder="e.g. Europe/Lisbon"
            className={`flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
          />
          <button
            onClick={() => setTimezoneInput(Intl.DateTimeFormat().resolvedOptions().timeZone)}
            title="Detect my timezone"
            className={`px-3 py-2 rounded-md border transition-colors ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600' : 'border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
        <p className={`text-xs mt-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          IANA timezone name. Click the clock to auto-detect from your browser.
        </p>
      </div>

      <div>
        <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          AI Model
        </label>
        <ModelSelector
          selectedModel={selectedModel}
          onModelChange={(modelId) => {
            setSelectedModel(modelId);
            localStorage.setItem('selected_model', modelId);
          }}
          isDarkMode={isDarkMode}
        />
        <p className={`text-xs mt-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Choose the AI model used in your conversations. For Ollama models, you can download them directly here.
        </p>
      </div>

      <div>
        <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          Language
        </label>
        <LanguageSelector currentLocale={locale} isDarkMode={isDarkMode} />
      </div>

      {onOpenTelegramSettings && (
        <div>
          <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            Telegram Bot
          </label>
          <button
            onClick={onOpenTelegramSettings}
            className={`w-full px-4 py-3 rounded-lg border transition-colors flex items-center justify-between ${
              isDarkMode
                ? 'border-gray-600 bg-gray-700/50 hover:bg-gray-700 text-gray-200'
                : 'border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-brand-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
              </svg>
              <span className="text-sm font-medium">Manage Telegram Bots</span>
            </div>
            <svg className="w-4 h-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <p className={`text-xs mt-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Configure bots and allowed Telegram users.
          </p>
        </div>
      )}

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
        disabled={isSavingKeys}
        className="px-5 py-2 bg-brand-900 text-white rounded-md hover:bg-brand-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
      >
        {isSavingKeys && <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>}
        Save Preferences
      </button>

    </div>
  );
}
