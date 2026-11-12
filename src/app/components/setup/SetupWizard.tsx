'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import * as authActions from '@/app/actions/auth';
import * as setupActions from '@/app/actions/setup';
import * as setupConfig from '@/app/actions/setup-config';
import type { SetupStatus } from '@/app/actions/setup-config';
import { prehashPassword } from '@/app/lib/password-prehash';
import { useInsecureContext } from '@/app/lib/use-insecure-context';
import { SETUP_STEPS, firstIncompleteStep, type SetupStepId } from '@/app/lib/setup-steps';
import {
  EmailStep,
  ErrorBanner,
  GoogleStep,
  LlmStep,
  SearchStep,
  StepHeader,
  TelegramStep,
} from './SetupConfigSteps';

interface SetupWizardProps {
  onComplete: () => void;
  /**
   * The admin account already exists and this browser is signed in as it
   * (e.g. the page was reloaded mid-setup): resume at the first step that is
   * not done yet.
   */
  accountCreated?: boolean;
}

type WizardStep = 'account' | SetupStepId | 'done';
const ORDER: readonly WizardStep[] = ['account', ...SETUP_STEPS, 'done'];

const LANGUAGES = [
  { code: 'en', labelKey: 'languageEnglish', flag: '🇺🇸' },
  { code: 'es', labelKey: 'languageSpanish', flag: '🇪🇸' },
  { code: 'pt', labelKey: 'languagePortuguese', flag: '🇧🇷' },
  { code: 'ca', labelKey: 'languageCatalan', flag: '🟡' },
] as const;

const inputClass = 'w-full px-4 py-2 rounded-lg border bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500';
const primaryButton = 'w-full py-3 px-4 rounded-lg font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed';

export default function SetupWizard({ onComplete, accountCreated = false }: SetupWizardProps) {
  const t = useTranslations('setup');
  const tLogin = useTranslations('login');

  // With an existing account the step is only known once the status loads.
  const [currentStep, setCurrentStep] = useState<WizardStep | null>(accountCreated ? null : 'account');
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // Status could not be loaded (shown with a retry button).
  const [statusFailed, setStatusFailed] = useState(false);
  const insecureContext = useInsecureContext();

  // Step: account. Once it exists it is never shown again (registering twice
  // would fail with "Email already registered").
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');

  // Step: language
  const [selectedLanguage, setSelectedLanguage] = useState('en');

  const loadStatus = async (): Promise<void> => {
    try {
      setStatus(await setupConfig.getSetupStatus());
      setStatusFailed(false);
    } catch {
      setStatusFailed(true);
    }
  };

  // Resume after a reload: jump to the first step that is not done.
  useEffect(() => {
    if (!accountCreated) return;
    let cancelled = false;
    setupConfig.getSetupStatus()
      .then((next) => {
        if (cancelled) return;
        setStatus(next);
        setCurrentStep(firstIncompleteStep(next.doneSteps) ?? 'done');
      })
      .catch(() => {
        if (cancelled) return;
        setStatusFailed(true);
        setCurrentStep('language');
      });
    return () => { cancelled = true; };
  }, [accountCreated]);

  const goTo = (step: WizardStep) => {
    setError('');
    setCurrentStep(step);
  };

  const stepAfter = (step: WizardStep): WizardStep => ORDER[Math.min(ORDER.indexOf(step) + 1, ORDER.length - 1)];
  // Never go back to the account step.
  const backFrom = (step: WizardStep) => {
    const previous = ORDER[ORDER.indexOf(step) - 1];
    return previous && previous !== 'account' ? () => goTo(previous) : undefined;
  };

  // Saved or skipped on the server: refresh the status, then move on.
  const handleStepDone = async (step: SetupStepId) => {
    await loadStatus();
    goTo(stepAfter(step));
  };

  const validateAccount = (): string | null => {
    if (!email || !email.includes('@')) return tLogin('validEmail');
    if (password.length < 8) return tLogin('passwordLength');
    if (password !== confirmPassword) return tLogin('passwordsNoMatch');
    return null;
  };

  const handleAccountSubmit = async () => {
    setError('');
    const validationError = validateAccount();
    if (validationError) {
      setError(validationError);
      return;
    }
    setIsLoading(true);
    try {
      // Same pre-hash as the login form, otherwise the stored hash never matches.
      const hashed = await prehashPassword(password);
      const result = await authActions.register(email, hashed, name || undefined);
      if (result.success) {
        setPassword('');
        setConfirmPassword('');
        await loadStatus();
        goTo('language');
      } else {
        setError(result.error);
      }
    } catch {
      setError(tLogin('unexpectedError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLanguageSubmit = async () => {
    setError('');
    setIsLoading(true);
    try {
      // Sets the locale cookie; the route refresh that follows re-renders the
      // wizard in the new language without losing its state.
      await setupActions.saveLocale(selectedLanguage);
      const result = await setupConfig.completeSetupStep('language');
      if (!result.success) {
        setError(result.error);
        return;
      }
      await loadStatus();
      goTo('llm');
    } catch {
      setError(tLogin('unexpectedError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinish = async () => {
    setError('');
    setIsLoading(true);
    try {
      // Clears the "setup in progress" marker, so it must be the last step:
      // afterwards /login redirects the signed-in admin to the hub.
      await setupActions.markSetupComplete();
      onComplete();
    } catch {
      setError(tLogin('unexpectedError'));
      setIsLoading(false);
    }
  };

  const stepNumber = currentStep ? ORDER.indexOf(currentStep) + 1 : 0;
  const progress = currentStep ? Math.round((ORDER.indexOf(currentStep) / (ORDER.length - 1)) * 100) : 0;

  const renderStep = () => {
    if (currentStep === null) {
      return (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-500 mx-auto" />
          <ErrorBanner message={error} />
        </div>
      );
    }

    if (currentStep === 'account') {
      return (
        <div className="space-y-5">
          <StepHeader title={t('step1Title')} description={t('step1Description')} />
          {insecureContext && (
            <div role="alert" className="p-3 rounded-lg bg-yellow-900/50 text-yellow-200 border border-yellow-700 text-sm">
              {t('insecureContext')}
            </div>
          )}
          <ErrorBanner message={error} />
          <label className="block">
            <span className="block text-sm font-medium text-gray-300 mb-1">{t('adminName')}</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={tLogin('yourName')} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-gray-300 mb-1">{t('adminEmail')} *</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" required className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-gray-300 mb-1">{t('adminPassword')} *</span>
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tLogin('atLeast8Chars')} required className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-gray-300 mb-1">{tLogin('confirmPassword')} *</span>
            <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={tLogin('confirmYourPassword')} required className={inputClass} />
          </label>
          <button type="button" onClick={handleAccountSubmit} disabled={isLoading} className={primaryButton}>
            {isLoading ? t('creating') : t('next')}
          </button>
        </div>
      );
    }

    if (currentStep === 'language') {
      return (
        <div className="space-y-5">
          <StepHeader title={t('step2Title')} description={t('step2Description')} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => setSelectedLanguage(lang.code)}
                className={`w-full p-3 rounded-lg border flex items-center gap-3 transition-colors ${
                  selectedLanguage === lang.code
                    ? 'border-brand-500 bg-brand-500/20 text-white'
                    : 'border-gray-600 bg-gray-700/50 text-gray-300 hover:border-gray-500'
                }`}
              >
                <span className="text-2xl">{lang.flag}</span>
                <span className="font-medium">{t(lang.labelKey)}</span>
              </button>
            ))}
          </div>
          <ErrorBanner message={error} />
          <button type="button" onClick={handleLanguageSubmit} disabled={isLoading} className={primaryButton}>
            {t('next')}
          </button>
        </div>
      );
    }

    if (currentStep === 'done') {
      return (
        <div className="space-y-6 text-center">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
            <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">{t('allSet')}</h2>
            <p className="text-gray-400 mt-2">{t('startChatting')}</p>
          </div>
          <ErrorBanner message={error} />
          <button
            type="button"
            onClick={handleFinish}
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-lg font-medium bg-gradient-to-r from-brand-500 to-brand-700 hover:from-brand-600 hover:to-brand-800 text-white transition-all disabled:opacity-60"
          >
            {t('finish')}
          </button>
        </div>
      );
    }

    if (!status) {
      return (
        <div className="space-y-4 text-center py-4">
          {statusFailed && <ErrorBanner message={tLogin('unexpectedError')} />}
          <button type="button" onClick={() => { void loadStatus(); }} className={primaryButton}>
            {t('retryConnection')}
          </button>
        </div>
      );
    }

    const props = { status, onBack: backFrom(currentStep), onDone: handleStepDone };
    switch (currentStep) {
      case 'llm': return <LlmStep {...props} />;
      case 'google': return <GoogleStep {...props} />;
      case 'email': return <EmailStep {...props} />;
      case 'search': return <SearchStep {...props} />;
      case 'telegram': return <TelegramStep {...props} />;
    }
  };

  return (
    // The outer layer scrolls so every step's buttons stay reachable on small
    // screens (and with the mobile keyboard open); the card centers only when
    // it fits.
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-gradient-to-br from-gray-900 via-brand-900 to-brand-900">
      <div className="min-h-full flex items-start sm:items-center justify-center p-3 sm:p-4">
        <div className="bg-gray-800/90 backdrop-blur-lg rounded-2xl shadow-2xl max-w-2xl w-full border border-gray-700 my-2 sm:my-0">
          <div className="p-5 sm:p-8 text-center border-b border-gray-700">
            <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
            <p className="text-gray-400 mt-1">{t('subtitle')}</p>
          </div>

          {/* Progress: a bar fits any screen width, unlike one bubble per step. */}
          <div className="px-5 sm:px-8 py-3 border-b border-gray-700">
            <div className="flex justify-between text-xs text-gray-400 mb-2">
              <span>{stepNumber > 0 ? t('stepCounter', { current: stepNumber, total: ORDER.length }) : '\u00a0'}</span>
            </div>
            <div
              className="h-1.5 rounded bg-gray-700 overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div className="h-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="p-5 sm:p-8">{renderStep()}</div>
        </div>
      </div>
    </div>
  );
}
