'use client';

/**
 * Unit configuration steps of the first-run setup wizard (LLM provider,
 * Google, email, search, Telegram). Each step saves through an admin-only
 * server action as soon as it is submitted; secrets are never read back,
 * only shown as "configured".
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as setupConfig from '@/app/actions/setup-config';
import type { SetupStatus, LlmTestResult } from '@/app/actions/setup-config';
import {
  SETUP_LLM_PROVIDERS,
  setupModelOptions,
  type SetupLlmProvider,
  type SetupStepId,
} from '@/app/lib/setup-steps';

// ─── Shared UI ──────────────────────────────────────────────────────────────

const inputClass = 'w-full px-4 py-2 rounded-lg border bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500';
const primaryButton = 'flex-1 py-3 px-4 rounded-lg font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed';
const secondaryButton = 'flex-1 py-3 px-4 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors disabled:opacity-60';

export function StepHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center mb-2">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <p className="text-gray-400 text-sm mt-1">{description}</p>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="p-3 rounded-lg bg-red-900/50 text-red-300 border border-red-700 text-sm break-words">
      {message}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-300 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}

function SecretInput({ value, onChange, configured, disabled }: {
  value: string;
  onChange: (value: string) => void;
  configured: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations('setup');
  return (
    <input
      type="password"
      autoComplete="off"
      spellCheck={false}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={configured ? t('keyConfiguredPlaceholder') : t('pasteKey')}
      className={inputClass}
    />
  );
}

function ConfiguredBadge({ text }: { text: string }) {
  return (
    <div className="p-3 rounded-lg bg-green-900/40 text-green-300 border border-green-700 text-sm">
      ✓ {text}
    </div>
  );
}

interface StepProps {
  status: SetupStatus;
  onBack?: () => void;
  /** Called after the step was saved or skipped on the server. */
  onDone: (step: SetupStepId) => void;
}

function useStepRunner(onError: (message: string) => void) {
  const t = useTranslations('login');
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<{ success: boolean; error?: string }>, onSuccess: () => void) => {
    onError('');
    setBusy(true);
    try {
      const result = await action();
      if (result.success) onSuccess();
      else onError(result.error || t('unexpectedError'));
    } catch {
      onError(t('unexpectedError'));
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

function OptionalActions({ step, busy, canSave, configured, onBack, onSave, onDone, onError }: {
  step: SetupStepId;
  busy: boolean;
  canSave: boolean;
  configured: boolean;
  onBack?: () => void;
  onSave: () => void;
  onDone: (step: SetupStepId) => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations('setup');
  const { busy: skipping, run } = useStepRunner(onError);
  const disabled = busy || skipping;
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400 text-center">{t('editLater')}</p>
      <div className="flex flex-col-reverse sm:flex-row gap-3">
        {onBack && (
          <button type="button" onClick={onBack} disabled={disabled} className={secondaryButton}>{t('back')}</button>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => run(() => setupConfig.completeSetupStep(step), () => onDone(step))}
          className={secondaryButton}
        >
          {configured ? t('keepAndContinue') : t('skip')}
        </button>
        <button type="button" onClick={onSave} disabled={disabled || !canSave} className={primaryButton}>
          {busy ? t('saving') : t('saveAndContinue')}
        </button>
      </div>
    </div>
  );
}

// ─── LLM provider (required) ────────────────────────────────────────────────

const PROVIDER_LABEL_KEY: Record<SetupLlmProvider, 'providerOpenai' | 'providerAnthropic' | 'providerOllama'> = {
  openai: 'providerOpenai',
  anthropic: 'providerAnthropic',
  ollama: 'providerOllama',
};

export function LlmStep({ status, onBack, onDone }: StepProps) {
  const t = useTranslations('setup');
  const tLogin = useTranslations('login');
  const initialProvider: SetupLlmProvider = status.llm.provider
    ?? (status.llm.keys.openai ? 'openai' : status.llm.keys.anthropic ? 'anthropic' : 'openai');

  const [provider, setProvider] = useState<SetupLlmProvider>(initialProvider);
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tested, setTested] = useState<LlmTestResult | null>(null);
  const [model, setModel] = useState<string>(status.llm.model ?? '');

  const needsKey = provider !== 'ollama';
  const keyStored = provider !== 'ollama' && status.llm.keys[provider];

  const resetTest = () => { setTested(null); setError(''); };

  const handleProvider = (next: SetupLlmProvider) => {
    setProvider(next);
    setApiKey('');
    resetTest();
  };

  const handleTest = async () => {
    setError('');
    setTesting(true);
    try {
      const result = await setupConfig.testLlmProvider(provider, apiKey || undefined);
      if (result.success) {
        setTested(result);
        const keep = result.models.find(m => m.id === model && m.available);
        setModel(keep?.id ?? result.defaultModel ?? '');
      } else {
        setTested(null);
        setError(result.error);
      }
    } catch {
      setError(tLogin('unexpectedError'));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!tested || !model) return;
    setError('');
    setSaving(true);
    try {
      const result = await setupConfig.saveLlmProvider({ provider, apiKey: apiKey || undefined, model });
      if (result.success) {
        // Chat views read the last picked model from localStorage first.
        try { localStorage.setItem('selected_model', result.model); } catch { /* storage unavailable */ }
        onDone('llm');
      } else {
        setError(result.error);
      }
    } catch {
      setError(tLogin('unexpectedError'));
    } finally {
      setSaving(false);
    }
  };

  const models = tested?.models ?? setupModelOptions(provider).map(m => ({ ...m, available: false }));
  const providerName = t(PROVIDER_LABEL_KEY[provider]);

  return (
    <div className="space-y-5">
      <StepHeader title={t('llmTitle')} description={t('llmDescription')} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label={t('llmProvider')}>
        {SETUP_LLM_PROVIDERS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={provider === id}
            onClick={() => handleProvider(id)}
            className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
              provider === id
                ? 'border-brand-500 bg-brand-500/20 text-white'
                : 'border-gray-600 bg-gray-700/50 text-gray-300 hover:border-gray-500'
            }`}
          >
            {t(PROVIDER_LABEL_KEY[id])}
          </button>
        ))}
      </div>

      {needsKey ? (
        <Field label={t('apiKeyLabel', { provider: providerName })} hint={keyStored ? t('keyConfiguredHint') : undefined}>
          <SecretInput value={apiKey} onChange={(v) => { setApiKey(v); resetTest(); }} configured={keyStored} disabled={testing || saving} />
        </Field>
      ) : (
        <Field label={t('ollamaAddress')} hint={t('ollamaAddressHint')}>
          <input type="text" readOnly value={status.llm.ollamaBaseUrl} className={`${inputClass} opacity-80`} />
        </Field>
      )}

      <button
        type="button"
        onClick={handleTest}
        disabled={testing || saving || (needsKey && !apiKey && !keyStored)}
        className="w-full py-3 px-4 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {testing ? t('testing') : error ? t('retryConnection') : t('testConnection')}
      </button>

      {tested && <ConfiguredBadge text={t('connectionSuccess')} />}
      <ErrorBanner message={error} />

      {tested && (
        <div>
          <span className="block text-sm font-medium text-gray-300 mb-2">{t('selectModel')}</span>
          <div className="space-y-2" role="radiogroup" aria-label={t('selectModel')}>
            {models.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={model === m.id}
                disabled={!m.available}
                onClick={() => setModel(m.id)}
                className={`w-full p-3 rounded-lg border text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  model === m.id
                    ? 'border-brand-500 bg-brand-500/20 text-white'
                    : 'border-gray-600 bg-gray-700/50 text-gray-300 hover:border-gray-500'
                }`}
              >
                <span className="block font-medium">{m.name}</span>
                <span className="block text-xs text-gray-400">{m.available ? m.description : t('modelNotInstalled')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">
        {provider === 'ollama'
          ? t('embeddingNoteOllama', { model: status.embedding.model, dimensions: status.embedding.dimensions })
          : t('embeddingNoteCloud', { provider: providerName, model: status.embedding.model, dimensions: status.embedding.dimensions })}
      </p>

      {!tested && <p className="text-xs text-yellow-300 text-center">{t('llmTestRequired')}</p>}

      <div className="flex flex-col-reverse sm:flex-row gap-3">
        {onBack && (
          <button type="button" onClick={onBack} disabled={saving} className={secondaryButton}>{t('back')}</button>
        )}
        <button type="button" onClick={handleSave} disabled={!tested || !model || saving || testing} className={primaryButton}>
          {saving ? t('saving') : t('next')}
        </button>
      </div>
    </div>
  );
}

// ─── Google / search (single key) ───────────────────────────────────────────

function SingleKeyStep({ step, title, description, keyLabel, configured, save, onBack, onDone }: {
  step: 'google' | 'search';
  title: string;
  description: string;
  keyLabel: string;
  configured: boolean;
  save: (key: string) => Promise<{ success: boolean; error?: string }>;
  onBack?: () => void;
  onDone: (step: SetupStepId) => void;
}) {
  const t = useTranslations('setup');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const { busy, run } = useStepRunner(setError);
  return (
    <div className="space-y-5">
      <StepHeader title={title} description={description} />
      {configured && <ConfiguredBadge text={t('configured')} />}
      <Field label={keyLabel} hint={configured ? t('keyConfiguredHint') : undefined}>
        <SecretInput value={key} onChange={setKey} configured={configured} disabled={busy} />
      </Field>
      <ErrorBanner message={error} />
      <OptionalActions
        step={step}
        busy={busy}
        canSave={key.trim().length > 0}
        configured={configured}
        onBack={onBack}
        onSave={() => run(() => save(key), () => onDone(step))}
        onDone={onDone}
        onError={setError}
      />
    </div>
  );
}

export function GoogleStep({ status, onBack, onDone }: StepProps) {
  const t = useTranslations('setup');
  return (
    <SingleKeyStep
      step="google"
      title={t('googleTitle')}
      description={t('googleDescription')}
      keyLabel={t('googleApiKey')}
      configured={status.googleConfigured}
      save={setupConfig.saveGoogleApiKey}
      onBack={onBack}
      onDone={onDone}
    />
  );
}

export function SearchStep({ status, onBack, onDone }: StepProps) {
  const t = useTranslations('setup');
  return (
    <SingleKeyStep
      step="search"
      title={t('searchTitle')}
      description={t('searchDescription')}
      keyLabel={t('tavilyApiKey')}
      configured={status.searchConfigured}
      save={setupConfig.saveSearchApiKey}
      onBack={onBack}
      onDone={onDone}
    />
  );
}

// ─── Email ──────────────────────────────────────────────────────────────────

export function EmailStep({ status, onBack, onDone }: StepProps) {
  const t = useTranslations('setup');
  const [apiKey, setApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState(status.email.fromEmail ?? '');
  const [error, setError] = useState('');
  const { busy, run } = useStepRunner(setError);
  const configured = status.email.apiKeyConfigured;
  return (
    <div className="space-y-5">
      <StepHeader title={t('emailTitle')} description={t('emailDescription')} />
      {configured && <ConfiguredBadge text={t('configured')} />}
      <Field label={t('resendApiKey')} hint={configured ? t('keyConfiguredHint') : undefined}>
        <SecretInput value={apiKey} onChange={setApiKey} configured={configured} disabled={busy} />
      </Field>
      <Field label={t('fromEmail')} hint={t('fromEmailHint')}>
        <input
          type="text"
          inputMode="email"
          autoComplete="off"
          value={fromEmail}
          disabled={busy}
          onChange={(e) => setFromEmail(e.target.value)}
          placeholder="Allerac <noreply@example.com>"
          className={inputClass}
        />
      </Field>
      <ErrorBanner message={error} />
      <OptionalActions
        step="email"
        busy={busy}
        canSave={fromEmail.trim().length > 0 && (configured || apiKey.trim().length > 0)}
        configured={configured}
        onBack={onBack}
        onSave={() => run(() => setupConfig.saveEmailSettings({ apiKey: apiKey || undefined, fromEmail }), () => onDone('email'))}
        onDone={onDone}
        onError={setError}
      />
    </div>
  );
}

// ─── Telegram ───────────────────────────────────────────────────────────────

export function TelegramStep({ status, onBack, onDone }: StepProps) {
  const t = useTranslations('setup');
  const [botToken, setBotToken] = useState('');
  const [allowedIds, setAllowedIds] = useState('');
  const [error, setError] = useState('');
  const { busy, run } = useStepRunner(setError);
  const configured = status.telegram.configured;
  return (
    <div className="space-y-5">
      <StepHeader title={t('telegramTitle')} description={t('telegramDescription')} />
      {configured ? (
        <ConfiguredBadge
          text={status.telegram.botUsername
            ? t('telegramConfigured', { username: status.telegram.botUsername })
            : t('configured')}
        />
      ) : (
        <>
          <Field label={t('telegramBotToken')}>
            <SecretInput value={botToken} onChange={setBotToken} configured={false} disabled={busy} />
          </Field>
          <Field label={t('telegramAllowedIds')} hint={t('telegramAllowedIdsHint')}>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={allowedIds}
              disabled={busy}
              onChange={(e) => setAllowedIds(e.target.value)}
              placeholder="123456789"
              className={inputClass}
            />
          </Field>
        </>
      )}
      <ErrorBanner message={error} />
      <OptionalActions
        step="telegram"
        busy={busy}
        canSave={!configured && botToken.trim().length > 0 && allowedIds.trim().length > 0}
        configured={configured}
        onBack={onBack}
        onSave={() => run(() => setupConfig.saveTelegramBot({ botToken, allowedTelegramIds: allowedIds }), () => onDone('telegram'))}
        onDone={onDone}
        onError={setError}
      />
    </div>
  );
}
