'use client';

import { useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { AlleracIcon } from '../ui/AlleracIcon';
import * as userActions from '@/app/actions/user';
import * as chatActions from '@/app/actions/chat';
import { validateApiKey } from '@/app/actions/api-keys';
import { MODELS } from '@/app/services/llm/models';
import type { Model } from '@/app/types';

interface Props {
  userId: string;
  userName: string;
  isDarkMode: boolean;
  systemMessage: string;
  ollamaConnected: boolean;
  /** Names of models installed in Ollama (e.g. "qwen2.5:3b"). */
  ollamaModels?: string[];
  onComplete: (updates: {
    googleApiKey?: string;
    githubToken?: string;
    anthropicApiKey?: string;
    openaiApiKey?: string;
    systemMessage?: string;
    selectedModel?: string;
  }) => void;
}

type ModelProvider = Model['provider'];

const PROVIDER_ORDER: ModelProvider[] = ['anthropic', 'openai', 'gemini', 'github', 'ollama'];
const PROVIDER_LABELS: Record<ModelProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  github: 'GitHub Models',
  ollama: 'Ollama',
};

const stripLatestTag = (name: string) => name.replace(/:latest$/, '');

type Step = 1 | 2 | 3 | 4;
type AltProvider = 'github' | 'anthropic' | 'openai' | 'ollama' | null;

const MIN_KEY_LENGTH = 20;
const isAnthropicKey = (value: string) => value.startsWith('sk-ant-') && value.length > MIN_KEY_LENGTH;
// OpenAI keys start with "sk-" (incl. "sk-proj-"); exclude Anthropic's "sk-ant-" prefix.
const isOpenaiKey = (value: string) =>
  value.startsWith('sk-') && !value.startsWith('sk-ant-') && value.length > MIN_KEY_LENGTH;

type KeyProvider = 'google' | 'github' | 'anthropic' | 'openai';
type KeyStatus = 'idle' | 'testing' | 'saved' | 'invalid' | 'failed';
interface KeyState { value: string; status: KeyStatus; visible: boolean }

const KEY_PROVIDERS: KeyProvider[] = ['google', 'github', 'anthropic', 'openai'];
/** Cheap format check before a key is sent to its provider. */
const KEY_FORMATS: Record<KeyProvider, (value: string) => boolean> = {
  google: value => value.startsWith('AIza') && value.length > MIN_KEY_LENGTH,
  github: value => (value.startsWith('ghp_') || value.startsWith('github_pat_')) && value.length > MIN_KEY_LENGTH,
  anthropic: isAnthropicKey,
  openai: isOpenaiKey,
};

/** Each key has its own positional argument in saveUserSettings. */
function saveKey(provider: KeyProvider, key: string) {
  switch (provider) {
    case 'github': return userActions.saveUserSettings(key);
    case 'google': return userActions.saveUserSettings(undefined, undefined, undefined, key);
    case 'anthropic': return userActions.saveUserSettings(undefined, undefined, undefined, undefined, key);
    case 'openai':
      return userActions.saveUserSettings(undefined, undefined, undefined, undefined, undefined, undefined, undefined, key);
  }
}

const emptyKeys = (): Record<KeyProvider, KeyState> =>
  Object.fromEntries(KEY_PROVIDERS.map(p => [p, { value: '', status: 'idle', visible: false }])) as Record<KeyProvider, KeyState>;

export default function OnboardingWizard({
  userId,
  userName,
  isDarkMode,
  systemMessage,
  ollamaConnected,
  ollamaModels = [],
  onComplete,
}: Props) {
  const t = useTranslations('onboarding');
  const locale = useLocale();

  const [step, setStep] = useState<Step>(1);
  const [isSaving, setIsSaving] = useState(false);

  // Step 2 state
  // Keys are tested with their provider and saved only once valid, on blur or
  // with the Test button; typing alone never saves anything.
  const [keys, setKeys] = useState<Record<KeyProvider, KeyState>>(emptyKeys);
  // Latest typed value and the value being (or already) verified, per provider:
  // guards against a blur and a click testing the same key twice, and against
  // a slow response for a value the user has since changed.
  const latestKey = useRef<Record<KeyProvider, string>>({ google: '', github: '', anthropic: '', openai: '' });
  const verifiedKey = useRef<Record<KeyProvider, string | null>>({ google: null, github: null, anthropic: null, openai: null });
  const googleKey = keys.google.value;
  const githubToken = keys.github.value;
  const anthropicKey = keys.anthropic.value;
  const openaiKey = keys.openai.value;
  const googleKeySaved = keys.google.status === 'saved';
  const githubTokenSaved = keys.github.status === 'saved';
  const anthropicKeySaved = keys.anthropic.status === 'saved';
  const openaiKeySaved = keys.openai.status === 'saved';
  const [altProvider, setAltProvider] = useState<AltProvider>(null);
  const [chosenModel, setChosenModel] = useState('');

  // Step 3 state
  const [location, setLocation] = useState('');
  const [aboutMe, setAboutMe] = useState(() => {
    const isCustom = systemMessage && systemMessage !== 'You are a helpful AI assistant.';
    return isCustom ? systemMessage : '';
  });
  const [aboutMeSaved, setAboutMeSaved] = useState(false);

  const firstName = userName?.split(' ')[0] || userName || '';

  const updateKey = (provider: KeyProvider, patch: Partial<KeyState>) =>
    setKeys(prev => ({ ...prev, [provider]: { ...prev[provider], ...patch } }));

  const handleKeyChange = (provider: KeyProvider, value: string) => {
    latestKey.current[provider] = value.trim();
    verifiedKey.current[provider] = null;
    updateKey(provider, { value, status: 'idle' });
  };

  /** Tests the key with its provider and saves it only when it is valid. */
  const verifyAndSaveKey = async (provider: KeyProvider) => {
    const key = latestKey.current[provider];
    if (!KEY_FORMATS[provider](key) || verifiedKey.current[provider] === key) return;
    verifiedKey.current[provider] = key;
    updateKey(provider, { status: 'testing' });
    let status: KeyStatus;
    try {
      const result = await validateApiKey(provider, key);
      if (result.valid) {
        await saveKey(provider, key);
        status = 'saved';
      } else {
        status = 'invalid';
      }
    } catch {
      status = 'failed';
    }
    if (latestKey.current[provider] !== key) return; // changed meanwhile
    if (status !== 'saved') verifiedKey.current[provider] = null; // allow a retry
    updateKey(provider, { status });
  };

  const handleSaveAboutMe = async () => {
    setIsSaving(true);
    if (location.trim()) {
      await userActions.saveUserSettings(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        location.trim(),
      );
    }
    if (aboutMe.trim()) {
      await chatActions.saveSystemMessage(aboutMe);
      setAboutMeSaved(true);
    }
    setIsSaving(false);
    setStep(4);
  };

  // Models the user can actually use with what they've configured so far.
  const configuredProviders = new Set<ModelProvider>();
  if (googleKeySaved) configuredProviders.add('gemini');
  if (githubTokenSaved) configuredProviders.add('github');
  if (anthropicKeySaved) configuredProviders.add('anthropic');
  if (openaiKeySaved) configuredProviders.add('openai');
  const installedOllama = new Set(ollamaModels.map(stripLatestTag));
  const availableModels = MODELS
    .filter(m => (m.provider === 'ollama'
      ? ollamaConnected && installedOllama.has(m.id)
      : configuredProviders.has(m.provider)))
    .sort((a, b) => PROVIDER_ORDER.indexOf(a.provider) - PROVIDER_ORDER.indexOf(b.provider));
  // Keep the user's pick while it stays available; otherwise suggest a "Pro" model.
  const selectedModel = availableModels.some(m => m.id === chosenModel)
    ? chosenModel
    : (availableModels.find(m => m.category === 'Pro') ?? availableModels[0])?.id ?? '';
  const selectedModelName = MODELS.find(m => m.id === selectedModel)?.name;

  const handleFinish = async () => {
    setIsSaving(true);
    if (selectedModel) {
      try {
        localStorage.setItem('selected_model', selectedModel);
      } catch {
        // Storage unavailable (private mode etc.) — the DB value below still applies.
      }
      await userActions.saveSelectedModel(selectedModel);
    }
    await userActions.completeOnboarding();
    setIsSaving(false);
    onComplete({
      googleApiKey: googleKeySaved ? googleKey.trim() : undefined,
      githubToken: githubTokenSaved ? githubToken.trim() : undefined,
      anthropicApiKey: anthropicKeySaved ? anthropicKey.trim() : undefined,
      openaiApiKey: openaiKeySaved ? openaiKey.trim() : undefined,
      systemMessage: aboutMeSaved ? aboutMe : undefined,
      selectedModel: selectedModel || undefined,
    });
  };

  const handleSkip = async () => {
    await userActions.completeOnboarding();
    onComplete({});
  };

  const anyProviderConfigured =
    googleKeySaved || githubTokenSaved || anthropicKeySaved || openaiKeySaved || ollamaConnected;

  const card = `relative w-full max-w-lg mx-4 rounded-2xl shadow-2xl p-8 ${isDarkMode ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`;
  const primaryBtn = `px-5 py-2.5 rounded-lg font-medium transition-all bg-brand-900 hover:bg-brand-800 text-white disabled:opacity-50 disabled:cursor-not-allowed`;
  const secondaryBtn = `px-5 py-2.5 rounded-lg font-medium transition-all ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`;
  const ghostBtn = `text-sm transition-colors ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`;
  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 ${isDarkMode ? 'bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`;
  const labelCls = `block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`;
  const checkIcon = (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );

  const providerBtn = (provider: Exclude<AltProvider, null>, label: string) => (
    <button
      onClick={() => setAltProvider(altProvider === provider ? null : provider)}
      className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${altProvider === provider ? 'border-brand-500 text-brand-600 bg-brand-50' : isDarkMode ? 'border-gray-700 text-gray-400 hover:border-gray-500' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
    >
      {label}
    </button>
  );

  const keyField = (provider: KeyProvider, opts: {
    label: string;
    placeholder: string;
    link?: { href: string; text: string };
  }) => {
    const state = keys[provider];
    const inputId = `onboarding-key-${provider}`;
    const canTest = KEY_FORMATS[provider](state.value.trim()) && state.status !== 'testing' && state.status !== 'saved';
    return (
      <div className="mb-4">
        <label htmlFor={inputId} className={labelCls}>{opts.label}</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              id={inputId}
              type={state.visible ? 'text' : 'password'}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={state.value}
              onChange={e => handleKeyChange(provider, e.target.value)}
              onBlur={() => void verifyAndSaveKey(provider)}
              placeholder={opts.placeholder}
              className={inputCls + ' pr-16' + (state.status === 'saved' ? ' border-green-500' : state.status === 'invalid' || state.status === 'failed' ? ' border-red-500' : '')}
            />
            <button
              type="button"
              onClick={() => updateKey(provider, { visible: !state.visible })}
              aria-label={state.visible ? t('hideKey') : t('showKey')}
              aria-pressed={state.visible}
              className={`absolute right-2 top-1/2 -translate-y-1/2 px-1.5 text-xs ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {state.visible ? t('hideKey') : t('showKey')}
            </button>
          </div>
          <button type="button" className={secondaryBtn + ' !px-3 text-xs whitespace-nowrap disabled:opacity-50'} disabled={!canTest} onClick={() => void verifyAndSaveKey(provider)}>
            {t('testKey')}
          </button>
        </div>
        <div aria-live="polite" className="mt-1.5 text-xs">
          {state.status === 'testing' && <span className={`flex items-center gap-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}><span className="w-3 h-3 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />{t('testingKey')}</span>}
          {state.status === 'saved' && <span className="flex items-center gap-1 text-green-500 font-medium">{checkIcon}{t('keySaved')}</span>}
          {state.status === 'invalid' && <span role="alert" className="text-red-500">{t('keyInvalid')}</span>}
          {state.status === 'failed' && <span role="alert" className="text-red-500">{t('keyTestFailed')}</span>}
        </div>
        {opts.link && (
          <a
            href={opts.link.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-block mt-1.5 text-xs underline-offset-2 hover:underline ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}
          >
            {opts.link.text} ↗
          </a>
        )}
      </div>
    );
  };

  // Step dots — shared header
  const stepDots = (
    <div className="flex items-center justify-between mb-8">
      <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
        {t('stepOf', { current: step, total: 4 })}
      </span>
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5">
          {([1, 2, 3, 4] as Step[]).map(s => (
            <div
              key={s}
              className={`rounded-full transition-all ${s === step ? 'w-5 h-2 bg-brand-900' : s < step ? 'w-2 h-2 bg-brand-600' : `w-2 h-2 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}`}
            />
          ))}
        </div>
        <select
          value={locale}
          onChange={async (e) => {
            await userActions.updateLanguage(e.target.value);
            window.location.reload();
          }}
          className={`text-xs px-2 py-1 rounded-lg border focus:outline-none ${isDarkMode ? 'bg-gray-800 border-gray-600 text-gray-300' : 'bg-white border-gray-200 text-gray-600'}`}
        >
          <option value="en">EN</option>
          <option value="pt">PT</option>
          <option value="es">ES</option>
          <option value="ca">CA</option>
        </select>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={card}>
        {stepDots}

        {/* ── Step 1: Welcome ── */}
        {step === 1 && (
          <div>
            <div className="text-center mb-8">
              <div className="w-fit mx-auto mb-5"><AlleracIcon size={64} /></div>
              <h1 className="text-2xl font-bold mb-2">{t('step1Title', { name: firstName })}</h1>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('step1Subtitle')}</p>
            </div>
            <ul className={`space-y-3 mb-8 p-4 rounded-xl ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
              {([t('step1Bullet1'), t('step1Bullet2'), t('step1Bullet3')] as string[]).map((bullet, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <svg className="w-4 h-4 text-brand-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  {bullet}
                </li>
              ))}
            </ul>
            <div className="flex flex-col items-center gap-3">
              <button className={primaryBtn + ' w-full'} onClick={() => setStep(2)}>{t('letsGo')} →</button>
              <button className={ghostBtn} onClick={handleSkip}>{t('skipSetup')}</button>
            </div>
          </div>
        )}

        {/* ── Step 2: Connect AI ── */}
        {step === 2 && (
          <div>
            <h2 className="text-xl font-bold mb-1">{t('step2Title')}</h2>
            <p className={`text-sm mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('step2Subtitle')}</p>
            <div className={`p-3 rounded-lg mb-4 text-xs space-y-1 ${isDarkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}`}>
              {t('step2Instructions').split('\n').map((line: string, i: number) => <p key={i}>{line}</p>)}
            </div>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg border text-sm font-medium mb-4 transition-colors ${isDarkMode ? 'border-gray-600 hover:bg-gray-800 text-gray-200' : 'border-gray-300 hover:bg-gray-50 text-gray-700'}`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
              </svg>
              {t('openStudio')}
              <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            {keyField('google', { label: t('pasteKeyLabel'), placeholder: t('keyPlaceholder') })}
            <div className={`flex items-center gap-3 mb-4 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              <div className={`flex-1 h-px ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
              {t('orDivider')}
              <div className={`flex-1 h-px ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {providerBtn('anthropic', t('haveAnthropicKey'))}
              {providerBtn('openai', t('haveOpenaiKey'))}
              {providerBtn('github', t('haveGithubToken'))}
              {providerBtn('ollama', t('useOllama'))}
            </div>
            {altProvider === 'anthropic' && keyField('anthropic', {
              label: t('anthropicKeyLabel'),
              placeholder: t('anthropicKeyPlaceholder'),
              link: { href: 'https://console.anthropic.com/settings/keys', text: t('getAnthropicKey') },
            })}
            {altProvider === 'openai' && keyField('openai', {
              label: t('openaiKeyLabel'),
              placeholder: t('openaiKeyPlaceholder'),
              link: { href: 'https://platform.openai.com/api-keys', text: t('getOpenaiKey') },
            })}
            {altProvider === 'github' && keyField('github', {
              label: t('githubTokenLabel'),
              placeholder: t('githubTokenPlaceholder'),
            })}
            {availableModels.length > 0 && (
              <div className="mb-4">
                <label htmlFor="onboarding-default-model" className={labelCls}>{t('defaultModelLabel')}</label>
                <select
                  id="onboarding-default-model"
                  value={selectedModel}
                  onChange={e => setChosenModel(e.target.value)}
                  className={inputCls}
                >
                  {PROVIDER_ORDER.filter(p => availableModels.some(m => m.provider === p)).map(p => (
                    <optgroup key={p} label={PROVIDER_LABELS[p]}>
                      {availableModels.filter(m => m.provider === p).map(m => (
                        <option key={m.id} value={m.id}>{m.icon} {m.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <p className={`mt-1.5 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('defaultModelHint')}</p>
              </div>
            )}
            {altProvider === 'ollama' && (
              <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${ollamaConnected ? 'bg-green-500/10 text-green-600' : isDarkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ollamaConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
                {ollamaConnected ? t('ollamaConnected') : t('ollamaNotConnected')}
              </div>
            )}
            <div className={`flex items-start gap-2 p-3 rounded-lg text-xs mb-4 ${isDarkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
              <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('step2PrivacyNote')}
            </div>
            <div className="flex items-center justify-between">
              <button className={secondaryBtn} onClick={() => setStep(1)}>← {t('back')}</button>
              <button className={primaryBtn} onClick={() => setStep(3)}>{t('next')} →</button>
            </div>
          </div>
        )}

        {/* ── Step 3: About Me ── */}
        {step === 3 && (
          <div>
            <h2 className="text-xl font-bold mb-1">{t('step3Title')}</h2>
            <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('step3Subtitle')}</p>
            <div className="mb-4">
              <label className={labelCls}>{t('step3LocationLabel')}</label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder={t('step3LocationPlaceholder')}
                className={inputCls}
              />
            </div>
            <div className="mb-1">
              <label className={labelCls}>{t('step3InstructionsLabel')}</label>
            </div>
            <textarea
              value={aboutMe}
              onChange={e => setAboutMe(e.target.value)}
              placeholder={t('step3Placeholder')}
              rows={6}
              className={inputCls + ' resize-none text-sm leading-relaxed'}
            />
            <div className="flex items-center justify-between mt-4">
              <button className={secondaryBtn} onClick={() => setStep(2)}>← {t('back')}</button>
              <div className="flex items-center gap-3">
                <button className={ghostBtn} onClick={() => setStep(4)}>{t('skipStep')}</button>
                <button className={primaryBtn} onClick={handleSaveAboutMe} disabled={isSaving}>
                  {isSaving ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {t('saveAndNext')}
                    </span>
                  ) : `${t('saveAndNext')} →`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4: Done ── */}
        {step === 4 && (
          <div className="text-center">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5 ${isDarkMode ? 'bg-green-900/40' : 'bg-green-50'}`}>
              <svg className="w-7 h-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2">{t('step4Title', { name: firstName })}</h2>
            {(anyProviderConfigured || aboutMeSaved) && (
              <div className={`text-left p-4 rounded-xl mb-6 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <p className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{t('step4ConfiguredWith')}</p>
                <ul className="space-y-1.5">
                  {googleKeySaved && <li className="flex items-center gap-2 text-sm text-green-500">{checkIcon}{t('step4Gemini')}</li>}
                  {githubTokenSaved && <li className="flex items-center gap-2 text-sm text-green-500">{checkIcon}{t('step4Github')}</li>}
                  {anthropicKeySaved && <li className="flex items-center gap-2 text-sm text-green-500">{checkIcon}{t('step4Anthropic')}</li>}
                  {openaiKeySaved && <li className="flex items-center gap-2 text-sm text-green-500">{checkIcon}{t('step4OpenAI')}</li>}
                  {ollamaConnected && <li className="flex items-center gap-2 text-sm text-green-500">{checkIcon}{t('step4Ollama')}</li>}
                  {selectedModelName && <li className="flex items-center gap-2 text-sm text-green-500">{checkIcon}{t('step4DefaultModel', { model: selectedModelName })}</li>}
                  {aboutMeSaved && <li className="flex items-center gap-2 text-sm text-green-500">{checkIcon}{t('step4AboutMe')}</li>}
                </ul>
              </div>
            )}
            <div className={`text-left p-4 rounded-xl mb-8 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
              <p className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{t('step4TipsTitle')}</p>
              <ul className="space-y-1.5">
                {([t('step4Tip1'), t('step4Tip2'), t('step4Tip3')] as string[]).map((tip, i) => (
                  <li key={i} className={`flex items-start gap-2 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    <span className="text-brand-600 mt-0.5">·</span>{tip}
                  </li>
                ))}
              </ul>
            </div>
            <button className={primaryBtn + ' w-full'} onClick={handleFinish} disabled={isSaving}>
              {isSaving ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('startChatting')}
                </span>
              ) : `${t('startChatting')} →`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
