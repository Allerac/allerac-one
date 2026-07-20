'use client';

import { useState, useEffect } from 'react';
import SystemDashboard from '@/app/components/system/SystemDashboard';
import { MODELS } from '@/app/services/llm/models';
import * as userActions from '@/app/actions/user';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  displayMode?: 'modal' | 'page';
  userId: string;
  userName?: string | null;
  userEmail?: string;
  isDarkMode: boolean;
}

export default function ConfigModal({ isOpen, onClose, displayMode = 'modal', userId, userName, userEmail, isDarkMode }: Props) {
  const [githubToken, setGithubToken]     = useState('');
  const [tavilyApiKey, setTavilyApiKey]   = useState('');
  const [googleApiKey, setGoogleApiKey]   = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');

  const [tokenInput, setTokenInput]           = useState('');
  const [tavilyKeyInput, setTavilyKeyInput]   = useState('');
  const [googleKeyInput, setGoogleKeyInput]   = useState('');
  const [anthropicKeyInput, setAnthropicKeyInput] = useState('');
  const [locationInput, setLocationInput]     = useState('');
  const [timezoneInput, setTimezoneInput]     = useState('');
  const [selectedModel, setSelectedModel]         = useState('gemini-2.5-flash');

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      try {
        const savedToken    = localStorage.getItem('github_token') || '';
        const savedTavilyKey = localStorage.getItem('tavily_api_key') || '';
        const settings = await userActions.loadUserSettings();
        if (settings) {
          setGithubToken(!savedToken && settings.github_token ? settings.github_token : savedToken);
          setTavilyApiKey(!savedTavilyKey && settings.tavily_api_key ? settings.tavily_api_key : savedTavilyKey);
          if (settings.google_api_key)    setGoogleApiKey(settings.google_api_key);
          if (settings.anthropic_api_key) setAnthropicApiKey(settings.anthropic_api_key);
          if (settings.location)          setLocationInput(settings.location);
          if (settings.timezone)          setTimezoneInput(settings.timezone);
          if (settings.selected_model)    setSelectedModel(settings.selected_model);
        } else {
          setGithubToken(savedToken);
          setTavilyApiKey(savedTavilyKey);
        }
      } catch (err) {
        console.error('[ConfigModal] load error:', err);
      }
    };
    load();
  }, [isOpen, userId]);

  const handleSave = async () => {
    const newGithubToken  = tokenInput.trim();
    const newTavilyKey    = tavilyKeyInput.trim();
    const newGoogleKey    = googleKeyInput.trim();
    const newAnthropicKey = anthropicKeyInput.trim();
    const newLocation     = locationInput.trim();
    const newTimezone     = timezoneInput.trim();

    try {
      if (newGithubToken)  { localStorage.setItem('github_token', newGithubToken); setGithubToken(newGithubToken); setTokenInput(''); }
      if (newTavilyKey)    { localStorage.setItem('tavily_api_key', newTavilyKey); setTavilyApiKey(newTavilyKey); setTavilyKeyInput(''); }
      if (newGoogleKey)    { setGoogleApiKey(newGoogleKey); setGoogleKeyInput(''); }
      if (newAnthropicKey) { setAnthropicApiKey(newAnthropicKey); setAnthropicKeyInput(''); }

      const result = await userActions.saveUserSettings(
        newGithubToken || undefined,
        newTavilyKey || undefined,
        undefined,
        newGoogleKey || undefined,
        newAnthropicKey || undefined,
        newLocation || undefined,
        newTimezone || undefined,
      );
      if (!result?.success) alert('Error saving settings to database.');
    } catch (err) {
      console.error('[ConfigModal] save error:', err);
      alert('Error saving settings. Please try again.');
    }
  };

  return (
    <SystemDashboard
      isOpen={isOpen}
      onClose={onClose}
      displayMode={displayMode}
      isDarkMode={isDarkMode}
      userId={userId}
      userName={userName ?? undefined}
      userEmail={userEmail}
      MODELS={MODELS}
      selectedModel={selectedModel}
      setSelectedModel={setSelectedModel}
      githubToken={githubToken}
      tavilyApiKey={tavilyApiKey}
      googleApiKey={googleApiKey}
      setGoogleApiKey={setGoogleApiKey}
      anthropicApiKey={anthropicApiKey}
      tokenInput={tokenInput}
      setTokenInput={setTokenInput}
      tavilyKeyInput={tavilyKeyInput}
      setTavilyKeyInput={setTavilyKeyInput}
      googleKeyInput={googleKeyInput}
      setGoogleKeyInput={setGoogleKeyInput}
      anthropicKeyInput={anthropicKeyInput}
      setAnthropicKeyInput={setAnthropicKeyInput}
      locationInput={locationInput}
      setLocationInput={setLocationInput}
      timezoneInput={timezoneInput}
      setTimezoneInput={setTimezoneInput}
      onSaveToken={handleSave}
    />
  );
}
