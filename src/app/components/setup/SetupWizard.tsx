'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import * as authActions from '@/app/actions/auth';
import * as setupActions from '@/app/actions/setup';

interface SetupWizardProps {
  onComplete: (user: { id: string; email: string; name: string | null }) => void;
}

interface OllamaModel {
  name: string;
  size: number;
}

type Step = 1 | 2 | 3 | 4;

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const t = useTranslations('setup');
  const tLogin = useTranslations('login');

  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Account
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  // Step 2: Language
  const [selectedLanguage, setSelectedLanguage] = useState('en');

  // Step 3: AI Model
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; responseTime?: number } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Check Ollama connection on mount
  useEffect(() => {
    checkOllamaConnection();
  }, []);

  const checkOllamaConnection = async () => {
    setIsCheckingConnection(true);
    try {
      const result = await setupActions.getOllamaModels();
      if (result.success) {
        setOllamaConnected(true);
        setModels(result.models);
        if (result.models.length > 0) {
          setSelectedModel(result.models[0].name);
        }
      } else {
        setOllamaConnected(false);
      }
    } catch (error) {
      setOllamaConnected(false);
    } finally {
      setIsCheckingConnection(false);
    }
  };

  const validateStep1 = (): string | null => {
    if (!email || !email.includes('@')) {
      return tLogin('validEmail');
    }
    if (password.length < 8) {
      return tLogin('passwordLength');
    }
    if (password !== confirmPassword) {
      return tLogin('passwordsNoMatch');
    }
    return null;
  };

  const handleStep1Submit = async () => {
    setError('');
    const validationError = validateStep1();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    try {
      const result = await authActions.register(email, password, name || undefined);
      if (result.success) {
        setUserId(result.user.id);
        setCurrentStep(2);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(tLogin('unexpectedError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleStep2Submit = async () => {
    setIsLoading(true);
    try {
      await setupActions.saveLocale(selectedLanguage);
      setCurrentStep(3);
      // Refresh to apply new locale
      // We could do a soft refresh here, but for now just continue
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!selectedModel) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await setupActions.testOllamaConnection(selectedModel);
      if (result.success) {
        setTestResult({
          success: true,
          message: t('connectionSuccess'),
          responseTime: result.responseTime,
        });
      } else {
        setTestResult({
          success: false,
          message: `${t('connectionFailed')}: ${result.error}`,
        });
      }
    } catch (error: any) {
      setTestResult({
        success: false,
        message: `${t('connectionFailed')}: ${error.message}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleStep3Submit = async () => {
    if (userId && selectedModel) {
      await setupActions.saveDefaultModel(userId, selectedModel);
    }
    await setupActions.markSetupComplete();
    setCurrentStep(4);
  };

  const handleFinish = () => {
    onComplete({
      id: userId!,
      email,
      name: name || null,
    });
  };

  const steps = [
    { number: 1, title: t('step1Title') },
    { number: 2, title: t('step2Title') },
    { number: 3, title: t('step3Title') },
    { number: 4, title: t('step4Title') },
  ];

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 flex items-center justify-center p-4">
      <div className="bg-gray-800/90 backdrop-blur-lg rounded-2xl shadow-2xl max-w-2xl w-full border border-gray-700">
        {/* Header */}
        <div className="p-8 text-center border-b border-gray-700">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
          <p className="text-gray-400 mt-1">{t('subtitle')}</p>
        </div>

        {/* Progress Steps */}
        <div className="px-8 py-4 border-b border-gray-700">
          <div className="flex justify-between">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    currentStep >= step.number
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {currentStep > step.number ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    step.number
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`w-12 md:w-24 h-1 mx-2 rounded ${
                      currentStep > step.number ? 'bg-blue-600' : 'bg-gray-700'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="p-8">
          {/* Step 1: Create Account */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-white">{t('step1Title')}</h2>
                <p className="text-gray-400 text-sm mt-1">{t('step1Description')}</p>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-900/50 text-red-300 border border-red-700 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {t('adminName')}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={tLogin('yourName')}
                  className="w-full px-4 py-2 rounded-lg border bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {t('adminEmail')} *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  className="w-full px-4 py-2 rounded-lg border bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {t('adminPassword')} *
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={tLogin('atLeast8Chars')}
                  required
                  className="w-full px-4 py-2 rounded-lg border bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {tLogin('confirmPassword')} *
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={tLogin('confirmYourPassword')}
                  required
                  className="w-full px-4 py-2 rounded-lg border bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                onClick={handleStep1Submit}
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                {isLoading ? t('creating') : t('next')}
              </button>
            </div>
          )}

          {/* Step 2: Choose Language */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-white">{t('step2Title')}</h2>
                <p className="text-gray-400 text-sm mt-1">{t('step2Description')}</p>
              </div>

              <div className="space-y-3">
                {[
                  { code: 'en', label: t('languageEnglish'), flag: '🇺🇸' },
                  { code: 'es', label: t('languageSpanish'), flag: '🇪🇸' },
                  { code: 'pt', label: t('languagePortuguese'), flag: '🇧🇷' },
                ].map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => setSelectedLanguage(lang.code)}
                    className={`w-full p-4 rounded-lg border flex items-center gap-4 transition-colors ${
                      selectedLanguage === lang.code
                        ? 'border-blue-500 bg-blue-500/20 text-white'
                        : 'border-gray-600 bg-gray-700/50 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <span className="text-2xl">{lang.flag}</span>
                    <span className="font-medium">{lang.label}</span>
                    {selectedLanguage === lang.code && (
                      <svg className="w-5 h-5 ml-auto text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="flex-1 py-3 px-4 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors"
                >
                  {t('back')}
                </button>
                <button
                  onClick={handleStep2Submit}
                  disabled={isLoading}
                  className="flex-1 py-3 px-4 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:bg-gray-600"
                >
                  {t('next')}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Configure AI Model */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-white">{t('step3Title')}</h2>
                <p className="text-gray-400 text-sm mt-1">{t('step3Description')}</p>
              </div>

              {isCheckingConnection ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="text-gray-400 mt-4">{t('checkingConnection')}</p>
                </div>
              ) : !ollamaConnected ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <p className="text-yellow-400 font-medium">{t('ollamaNotConnected')}</p>
                  <p className="text-gray-400 text-sm mt-2">{t('downloadingModel')}</p>
                  <button
                    onClick={checkOllamaConnection}
                    className="mt-4 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors"
                  >
                    Retry Connection
                  </button>
                </div>
              ) : models.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400">{t('noModelsFound')}</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {t('selectModel')}
                    </label>
                    <div className="space-y-2">
                      {models.map((model) => (
                        <button
                          key={model.name}
                          onClick={() => {
                            setSelectedModel(model.name);
                            setTestResult(null);
                          }}
                          className={`w-full p-4 rounded-lg border flex items-center justify-between transition-colors ${
                            selectedModel === model.name
                              ? 'border-blue-500 bg-blue-500/20 text-white'
                              : 'border-gray-600 bg-gray-700/50 text-gray-300 hover:border-gray-500'
                          }`}
                        >
                          <span className="font-medium">{model.name}</span>
                          <span className="text-sm text-gray-400">
                            {t('modelSize', { size: formatBytes(model.size) })}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <button
                      onClick={handleTestConnection}
                      disabled={isTesting || !selectedModel}
                      className="w-full py-3 px-4 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors disabled:bg-gray-800 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isTesting ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          {t('testing')}
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          {t('testConnection')}
                        </>
                      )}
                    </button>

                    {testResult && (
                      <div
                        className={`mt-3 p-3 rounded-lg text-sm ${
                          testResult.success
                            ? 'bg-green-900/50 text-green-300 border border-green-700'
                            : 'bg-red-900/50 text-red-300 border border-red-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {testResult.success ? (
                            <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                          <span>{testResult.message}</span>
                        </div>
                        {testResult.responseTime && (
                          <p className="mt-1 text-gray-400">
                            {t('responseTime', { time: testResult.responseTime })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="flex-1 py-3 px-4 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors"
                >
                  {t('back')}
                </button>
                <button
                  onClick={handleStep3Submit}
                  className="flex-1 py-3 px-4 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  {t('next')}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Complete */}
          {currentStep === 4 && (
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

              <button
                onClick={handleFinish}
                className="w-full py-3 px-4 rounded-lg font-medium bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white transition-all transform hover:scale-105"
              >
                {t('finish')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
