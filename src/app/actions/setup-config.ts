'use server';

/**
 * Server actions behind the first-run setup wizard's configuration steps.
 *
 * Every action requires a signed-in admin. Settings go to the same storage the
 * Settings / Admin pages already use:
 * - LLM, Google, search and email keys: system_settings (encrypted, instance-wide)
 * - default chat model: user_settings.selected_model of the admin
 * - Telegram bot: telegram_bot_configs (token encrypted) owned by the admin
 * Secrets are never returned to the client, only whether they are configured.
 */

import { cookies } from 'next/headers';
import pool from '@/app/clients/db';
import { requireCurrentAdmin } from '@/app/lib/auth-session';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { TelegramBotConfigService } from '@/app/services/telegram/telegram-bot-config.service';
import {
  OPTIONAL_SETUP_STEPS,
  defaultSetupModel,
  isSetupLlmProvider,
  isSetupStepId,
  ollamaModelInstalled,
  parseDoneSteps,
  setupModelOptions,
  setupProviderForModel,
  type SetupLlmProvider,
  type SetupStepId,
} from '@/app/lib/setup-steps';

const systemSettings = new SystemSettingsService();
const userSettings = new UserSettingsService();

const SETUP_STEPS_COOKIE = 'setup_steps';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_SECRET_LENGTH = 1000;

function ollamaBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
}

function embeddingInfo() {
  const dimensions = Number(process.env.EMBEDDING_DIMENSIONS);
  return {
    provider: 'ollama' as const,
    model: process.env.EMBEDDING_MODEL || 'embeddinggemma',
    dimensions: Number.isInteger(dimensions) && dimensions > 0 ? dimensions : 768,
  };
}

type Result<T = object> = ({ success: true } & T) | { success: false; error: string };

// ─── Step progress ──────────────────────────────────────────────────────────

async function readDoneSteps(): Promise<SetupStepId[]> {
  const cookieStore = await cookies();
  return parseDoneSteps(cookieStore.get(SETUP_STEPS_COOKIE)?.value);
}

async function markStepDone(step: SetupStepId): Promise<void> {
  const done = new Set(await readDoneSteps());
  done.add(step);
  const cookieStore = await cookies();
  cookieStore.set(SETUP_STEPS_COOKIE, [...done].join(','), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  });
}

export interface SetupStatus {
  doneSteps: SetupStepId[];
  llm: {
    provider: SetupLlmProvider | null;
    model: string | null;
    keys: { openai: boolean; anthropic: boolean };
    ollamaBaseUrl: string;
  };
  embedding: { provider: 'ollama'; model: string; dimensions: number };
  googleConfigured: boolean;
  email: { apiKeyConfigured: boolean; fromEmail: string | null };
  searchConfigured: boolean;
  telegram: { configured: boolean; botUsername: string | null };
}

/** What is configured already (booleans only for secrets) and which steps are done. */
export async function getSetupStatus(): Promise<SetupStatus> {
  const admin = await requireCurrentAdmin();
  const [sys, user, telegram, doneFromCookie] = await Promise.all([
    systemSettings.loadAll(),
    userSettings.loadUserSettings(admin.id),
    pool.query<{ bot_username: string | null }>(
      'SELECT bot_username FROM telegram_bot_configs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [admin.id],
    ).catch(() => ({ rows: [] as { bot_username: string | null }[] })),
    readDoneSteps(),
  ]);

  const keys = {
    openai: Boolean(sys.openai_api_key || process.env.OPENAI_API_KEY),
    anthropic: Boolean(sys.anthropic_api_key || process.env.ANTHROPIC_API_KEY),
  };
  const model = user?.selected_model ?? null;
  const provider = setupProviderForModel(model);

  // The LLM step only counts as done when a usable provider is saved.
  const llmReady = provider === 'ollama' || (provider !== null && keys[provider]);
  const doneSteps = doneFromCookie.filter(step => step !== 'llm' || llmReady);

  return {
    doneSteps,
    llm: { provider, model, keys, ollamaBaseUrl: ollamaBaseUrl() },
    embedding: embeddingInfo(),
    googleConfigured: Boolean(sys.google_api_key),
    email: { apiKeyConfigured: Boolean(sys.resend_api_key), fromEmail: sys.resend_from_email || null },
    searchConfigured: Boolean(sys.tavily_api_key || process.env.TAVILY_API_KEY),
    telegram: { configured: telegram.rows.length > 0, botUsername: telegram.rows[0]?.bot_username ?? null },
  };
}

/** Marks an optional step as done without changing anything (Skip / Next on a configured step). */
export async function completeSetupStep(step: SetupStepId): Promise<Result> {
  await requireCurrentAdmin();
  if (!isSetupStepId(step) || !OPTIONAL_SETUP_STEPS.includes(step)) {
    return { success: false, error: 'This step cannot be skipped' };
  }
  await markStepDone(step);
  return { success: true };
}

// ─── Connection checks ──────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function networkErrorMessage(error: unknown, target: string): string {
  const err = error as { name?: string; code?: string; cause?: { code?: string } };
  const code = err?.cause?.code ?? err?.code;
  if (err?.name === 'AbortError') return `${target} did not answer in time`;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `${target} host could not be resolved`;
  if (code === 'ECONNREFUSED') return `${target} refused the connection`;
  return `Could not connect to ${target}`;
}

function statusError(status: number, target: string): string {
  if (status === 401 || status === 403) return 'Invalid or unauthorized key';
  return `${target} returned HTTP ${status}`;
}

async function listOllamaModels(): Promise<Result<{ installed: string[] }>> {
  const base = ollamaBaseUrl();
  try {
    const res = await fetchWithTimeout(`${base}/api/tags`);
    if (!res.ok) return { success: false, error: statusError(res.status, 'Ollama') };
    const data = await res.json() as { models?: { name?: string }[] };
    const installed = (data.models ?? []).map(m => m.name).filter((n): n is string => typeof n === 'string');
    return { success: true, installed };
  } catch (error) {
    // Public units often run without Ollama (no "ollama" host): explain, don't throw.
    return {
      success: false,
      error: `${networkErrorMessage(error, 'Ollama')} at ${base}. This unit may run without Ollama: choose a cloud provider, or set OLLAMA_BASE_URL on the server.`,
    };
  }
}

async function checkCloudKey(provider: 'openai' | 'anthropic', key: string): Promise<Result> {
  const target = provider === 'openai' ? 'OpenAI' : 'Anthropic';
  try {
    const res = provider === 'openai'
      ? await fetchWithTimeout('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } })
      : await fetchWithTimeout('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      });
    return res.ok ? { success: true } : { success: false, error: statusError(res.status, target) };
  } catch (error) {
    return { success: false, error: networkErrorMessage(error, target) };
  }
}

function cleanSecret(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function storedCloudKey(provider: 'openai' | 'anthropic'): Promise<string> {
  const stored = await systemSettings.get(provider === 'openai' ? 'openai_api_key' : 'anthropic_api_key');
  const env = provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  return stored || env || '';
}

export interface LlmTestResult {
  /** Model ids from the provider's list that can be picked as default. */
  models: { id: string; name: string; description: string; available: boolean }[];
  defaultModel: string | null;
}

/**
 * Checks a provider. For OpenAI/Anthropic an empty `apiKey` re-tests the key
 * that is already stored. Nothing is saved here.
 */
export async function testLlmProvider(
  provider: SetupLlmProvider,
  apiKey?: string,
): Promise<Result<LlmTestResult>> {
  await requireCurrentAdmin();
  if (!isSetupLlmProvider(provider)) return { success: false, error: 'Unknown provider' };

  if (provider === 'ollama') {
    const tags = await listOllamaModels();
    if (!tags.success) return tags;
    const models = setupModelOptions('ollama').map(m => ({ ...m, available: ollamaModelInstalled(m.id, tags.installed) }));
    if (!models.some(m => m.available)) {
      return {
        success: false,
        error: `Ollama is reachable but none of the supported models is installed (${models.map(m => m.id).join(', ')}). Pull one, e.g. "ollama pull ${defaultSetupModel('ollama')}", then test again.`,
      };
    }
    const preferred = defaultSetupModel('ollama');
    const defaultModel = models.find(m => m.id === preferred && m.available)?.id ?? models.find(m => m.available)!.id;
    return { success: true, models, defaultModel };
  }

  const key = cleanSecret(apiKey) || await storedCloudKey(provider);
  if (!key) return { success: false, error: 'Paste an API key first' };
  if (key.length > MAX_SECRET_LENGTH) return { success: false, error: 'Key is too long' };
  const check = await checkCloudKey(provider, key);
  if (!check.success) return check;
  return {
    success: true,
    models: setupModelOptions(provider).map(m => ({ ...m, available: true })),
    defaultModel: defaultSetupModel(provider),
  };
}

/**
 * Required LLM step: tests the provider again, then stores the key (if one was
 * pasted) and the admin's default chat model. Nothing is stored if the test fails.
 */
export async function saveLlmProvider(input: {
  provider: SetupLlmProvider;
  apiKey?: string;
  model: string;
}): Promise<Result<{ model: string }>> {
  const admin = await requireCurrentAdmin();
  const { provider, model } = input ?? ({} as typeof input);
  if (!isSetupLlmProvider(provider)) return { success: false, error: 'Unknown provider' };
  if (setupProviderForModel(model) !== provider) return { success: false, error: 'Pick a model for this provider' };

  const test = await testLlmProvider(provider, input.apiKey);
  if (!test.success) return test;
  if (!test.models.some(m => m.id === model && m.available)) {
    return { success: false, error: 'That model is not available on this provider' };
  }

  const key = cleanSecret(input.apiKey);
  if (provider !== 'ollama' && key) {
    await systemSettings.set(provider === 'openai' ? 'openai_api_key' : 'anthropic_api_key', key, admin.id);
  }
  const saved = await userSettings.saveSelectedModel(admin.id, model);
  if (!saved.success) return { success: false, error: 'Could not save the default model' };

  await markStepDone('llm');
  return { success: true, model };
}

// ─── Optional steps ─────────────────────────────────────────────────────────

/** Google API key (Gemini models and Google-backed tools). */
export async function saveGoogleApiKey(apiKey: string): Promise<Result> {
  const admin = await requireCurrentAdmin();
  const key = cleanSecret(apiKey);
  if (!key) return { success: false, error: 'Paste an API key first' };
  if (key.length > MAX_SECRET_LENGTH) return { success: false, error: 'Key is too long' };
  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
    );
    if (!res.ok) return { success: false, error: res.status === 400 ? 'Invalid or unauthorized key' : statusError(res.status, 'Google') };
  } catch (error) {
    return { success: false, error: networkErrorMessage(error, 'Google') };
  }
  await systemSettings.set('google_api_key', key, admin.id);
  await markStepDone('google');
  return { success: true };
}

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** Accepts "user@domain" or "Name <user@domain>". */
function isValidFromAddress(value: string): boolean {
  const match = value.match(/^[^<>]*<([^<>]+)>$/);
  return EMAIL_PATTERN.test(match ? match[1].trim() : value);
}

/** Resend key (optional when one is stored already) and sender address. */
export async function saveEmailSettings(input: { apiKey?: string; fromEmail: string }): Promise<Result> {
  const admin = await requireCurrentAdmin();
  const key = cleanSecret(input?.apiKey);
  const fromEmail = typeof input?.fromEmail === 'string' ? input.fromEmail.trim() : '';
  if (!isValidFromAddress(fromEmail)) return { success: false, error: 'Enter a valid sender address' };
  if (key.length > MAX_SECRET_LENGTH) return { success: false, error: 'Key is too long' };
  if (!key && !(await systemSettings.get('resend_api_key'))) {
    return { success: false, error: 'Paste an API key first' };
  }
  if (key) await systemSettings.set('resend_api_key', key, admin.id);
  await systemSettings.set('resend_from_email', fromEmail, admin.id);
  await markStepDone('email');
  return { success: true };
}

/** Tavily key used by the web search and read-URL tools. */
export async function saveSearchApiKey(apiKey: string): Promise<Result> {
  const admin = await requireCurrentAdmin();
  const key = cleanSecret(apiKey);
  if (!key) return { success: false, error: 'Paste an API key first' };
  if (key.length > MAX_SECRET_LENGTH) return { success: false, error: 'Key is too long' };
  try {
    const res = await fetchWithTimeout('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query: 'test', max_results: 1 }),
    });
    if (!res.ok) return { success: false, error: statusError(res.status, 'Tavily') };
  } catch (error) {
    return { success: false, error: networkErrorMessage(error, 'Tavily') };
  }
  await systemSettings.set('tavily_api_key', key, admin.id);
  await markStepDone('search');
  return { success: true };
}

const TELEGRAM_TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]+$/;

/** Creates a Telegram bot owned by the admin, after checking the token with Telegram. */
export async function saveTelegramBot(input: {
  botToken: string;
  allowedTelegramIds: string;
  botName?: string;
}): Promise<Result<{ botUsername: string | null }>> {
  const admin = await requireCurrentAdmin();
  const token = cleanSecret(input?.botToken);
  if (!TELEGRAM_TOKEN_PATTERN.test(token)) return { success: false, error: 'Invalid bot token format' };

  const ids = (input?.allowedTelegramIds ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (ids.length === 0 || ids.some(id => !/^\d{1,15}$/.test(id))) {
    return { success: false, error: 'Enter at least one numeric Telegram user ID' };
  }
  const botName = (input?.botName ?? '').trim().slice(0, 100) || 'Allerac';

  let botUsername: string | null = null;
  try {
    const res = await fetchWithTimeout(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json() as { ok?: boolean; result?: { username?: string } };
    if (!data.ok) return { success: false, error: 'Telegram rejected this token' };
    botUsername = data.result?.username ?? null;
  } catch (error) {
    return { success: false, error: networkErrorMessage(error, 'Telegram') };
  }

  try {
    await TelegramBotConfigService.createBotConfig(admin.id, botName, token, ids.map(Number), botUsername ?? undefined);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505') {
      return { success: false, error: 'A bot with this name already exists' };
    }
    if (error instanceof Error && error.message.includes('TELEGRAM_TOKEN_ENCRYPTION_KEY')) {
      return { success: false, error: 'Telegram is not enabled on this server (TELEGRAM_TOKEN_ENCRYPTION_KEY is not set)' };
    }
    console.error('[setup] Failed to save Telegram bot:', error instanceof Error ? error.message : 'unknown error');
    return { success: false, error: 'Could not save the Telegram bot' };
  }

  await markStepDone('telegram');
  return { success: true, botUsername };
}
