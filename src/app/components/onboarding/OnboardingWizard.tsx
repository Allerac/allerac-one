'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { AlleracIcon } from '../ui/AlleracIcon';
import * as userActions from '@/app/actions/user';
import * as chatActions from '@/app/actions/chat';

interface Props {
  userId: string;
  userName: string;
  isDarkMode: boolean;
  systemMessage: string;
  ollamaConnected: boolean;
  onComplete: (updates: { googleApiKey?: string; githubToken?: string; systemMessage?: string }) => void;
}

type Step = 1 | 2 | 3 | 4;
type AltProvider = 'github' | 'ollama' | null;

export default function OnboardingWizard({
  userId,
  userName,
  isDarkMode,
  systemMessage,
  ollamaConnected,
  onComplete,
}: Props) {
  const t = useTranslations('onboarding');
  const locale = useLocale();

  const [step, setStep] = useState<Step>(1);
  const [isSaving, setIsSaving] = useState(false);

  // Step 2 state
  const [googleKey, setGoogleKey] = useState('');
  const [googleKeySaved, setGoogleKeySaved] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [githubTokenSaved, setGithubTokenSaved] = useState(false);
  const [altProvider, setAltProvider] = useState<AltProvider>(null);

  // Step 3 state
  const [aboutMe, setAboutMe] = useState(() => {
    const isCustom = systemMessage && systemMessage !== 'You are a helpful AI assistant.';
    return isCustom ? systemMessage : '';
  });
  const [aboutMeSaved, setAboutMeSaved] = useState(false);

  const firstName = userName?.split(' ')[0] || userName || '';

  const handleGoogleKeyChange = async (value: string) => {
    setGoogleKey(value);
    setGoogleKeySaved(false);
    if (value.startsWith('AIza') && value.length > 20) {
      setIsSaving(true);
      await userActions.saveUserSettings(userId, undefined, undefined, undefined, value);
      setGoogleKeySaved(true);
      setIsSaving(false);
    }
  };

  const handleGithubTokenChange = async (value: string) => {
    setGithubToken(value);
    setGithubTokenSaved(false);
    if ((value.startsWith('ghp_') || value.startsWith('github_pat_')) && value.length > 20) {
      setIsSaving(true);
      await userActions.saveUserSettings(userId, value);
      setGithubTokenSaved(true);
      setIsSaving(false);
    }
  };

  const handleSaveAboutMe = async () => {
    if (!aboutMe.trim()) return;
    setIsSaving(true);
    await chatActions.saveSystemMessage(userId, aboutMe);
    setAboutMeSaved(true);
    setIsSaving(false);
    setStep(4);
  };

  const handleFinish = async () => {
    setIsSaving(true);
    await userActions.completeOnboarding(userId);
    setIsSaving(false);
    onComplete({
      googleApiKey: googleKeySaved ? googleKey : undefined,
      githubToken: githubTokenSaved ? githubToken : undefined,
      systemMessage: aboutMeSaved ? aboutMe : undefined,
    });
  };

  const handleSkip = async () => {
    await userActions.completeOnboarding(userId);
    onComplete({});
  };

  const anyProviderConfigured = googleKeySaved || githubTokenSaved || ollamaConnected;

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
            <div className="mb-4">
              <label className={labelCls}>{t('pasteKeyLabel')}</label>
              <div className="relative">
                <input type="text" value={googleKey} onChange={e => handleGoogleKeyChange(e.target.value)} placeholder={t('keyPlaceholder')} className={inputCls + (googleKeySaved ? ' border-green-500' : '')} />
                {isSaving && !googleKeySaved && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />}
                {googleKeySaved && <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-green-500 text-xs font-medium">{checkIcon}{t('keySaved')}</div>}
              </div>
            </div>
            <div className={`flex items-center gap-3 mb-4 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              <div className={`flex-1 h-px ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
              {t('orDivider')}
              <div className={`flex-1 h-px ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setAltProvider(altProvider === 'github' ? null : 'github')} className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${altProvider === 'github' ? 'border-brand-500 text-brand-600 bg-brand-50' : isDarkMode ? 'border-gray-700 text-gray-400 hover:border-gray-500' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>{t('haveGithubToken')}</button>
              <button onClick={() => setAltProvider(altProvider === 'ollama' ? null : 'ollama')} className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${altProvider === 'ollama' ? 'border-brand-500 text-brand-600 bg-brand-50' : isDarkMode ? 'border-gray-700 text-gray-400 hover:border-gray-500' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>{t('useOllama')}</button>
            </div>
            {altProvider === 'github' && (
              <div className="mb-4">
                <label className={labelCls}>{t('githubTokenLabel')}</label>
                <div className="relative">
                  <input type="text" value={githubToken} onChange={e => handleGithubTokenChange(e.target.value)} placeholder={t('githubTokenPlaceholder')} className={inputCls + (githubTokenSaved ? ' border-green-500' : '')} />
                  {githubTokenSaved && <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-green-500 text-xs font-medium">{checkIcon}{t('keySaved')}</div>}
                </div>
              </div>
            )}
            {altProvider === 'ollama' && (
              <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${ollamaConnected ? 'bg-green-500/10 text-green-600' : isDarkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ollamaConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
                {ollamaConnected ? t('ollamaConnected') : t('ollamaNotConnected')}
              </div>
            )}
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
            <textarea
              value={aboutMe}
              onChange={e => setAboutMe(e.target.value)}
              placeholder={t('step3Placeholder')}
              rows={8}
              className={inputCls + ' resize-none text-sm leading-relaxed'}
            />
            <div className="flex items-center justify-between mt-4">
              <button className={secondaryBtn} onClick={() => setStep(2)}>← {t('back')}</button>
              <div className="flex items-center gap-3">
                <button className={ghostBtn} onClick={() => setStep(4)}>{t('skipStep')}</button>
                <button className={primaryBtn} onClick={handleSaveAboutMe} disabled={isSaving || !aboutMe.trim()}>
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
                  {ollamaConnected && <li className="flex items-center gap-2 text-sm text-green-500">{checkIcon}{t('step4Ollama')}</li>}
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
