/**
 * Setup wizard configuration actions: admin-only, persist to the existing
 * storage, never return secrets, and the LLM step cannot be skipped.
 */
const mockCookies = new Map<string, string>();
jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (mockCookies.has(name) ? { value: mockCookies.get(name) } : undefined),
    set: (name: string, value: string) => { mockCookies.set(name, value); },
    delete: (name: string) => { mockCookies.delete(name); },
  }),
}));

const mockRequireAdmin = jest.fn();
jest.mock('@/app/lib/auth-session', () => ({ requireCurrentAdmin: () => mockRequireAdmin() }));

const mockSystemStore = new Map<string, string>();
const mockSysSet = jest.fn(async (key: string, value: string) => { mockSystemStore.set(key, value); });
jest.mock('@/app/services/system/system-settings.service', () => ({
  SystemSettingsService: jest.fn().mockImplementation(() => ({
    set: (...a: [string, string]) => mockSysSet(...a),
    get: async (key: string) => mockSystemStore.get(key) ?? null,
    loadAll: async () => ({
      github_token: null,
      github_repo_token: null,
      tavily_api_key: mockSystemStore.get('tavily_api_key') ?? null,
      anthropic_api_key: mockSystemStore.get('anthropic_api_key') ?? null,
      google_api_key: mockSystemStore.get('google_api_key') ?? null,
      openai_api_key: mockSystemStore.get('openai_api_key') ?? null,
      resend_api_key: mockSystemStore.get('resend_api_key') ?? null,
      resend_from_email: mockSystemStore.get('resend_from_email') ?? null,
    }),
  })),
}));

let mockSelectedModel: string | null = null;
const mockSaveSelectedModel = jest.fn(async (_userId: string, model: string) => { mockSelectedModel = model; return { success: true }; });
jest.mock('@/app/services/user/user-settings.service', () => ({
  UserSettingsService: jest.fn().mockImplementation(() => ({
    loadUserSettings: async () => ({ selected_model: mockSelectedModel }),
    saveSelectedModel: (...a: [string, string]) => mockSaveSelectedModel(...a),
  })),
}));

const mockCreateBot = jest.fn();
jest.mock('@/app/services/telegram/telegram-bot-config.service', () => ({
  TelegramBotConfigService: { createBotConfig: (...a: unknown[]) => mockCreateBot(...a) },
}));
const mockQuery = jest.fn();
jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: (...a: unknown[]) => mockQuery(...a) } }));

import {
  completeSetupStep,
  getSetupStatus,
  saveEmailSettings,
  saveGoogleApiKey,
  saveLlmProvider,
  saveSearchApiKey,
  saveTelegramBot,
  testLlmProvider,
} from '@/app/actions/setup-config';

const admin = { id: 'admin-1', email: 'a@example.com', name: 'A', is_admin: true, created_at: new Date() };
const OPENAI_KEY = 'sk-test-openai-secret';
const originalFetch = global.fetch;
const mockFetch = jest.fn();

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCookies.clear();
  mockSystemStore.clear();
  mockSelectedModel = null;
  mockRequireAdmin.mockResolvedValue(admin);
  mockQuery.mockResolvedValue({ rows: [] });
  global.fetch = mockFetch as unknown as typeof fetch;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.TAVILY_API_KEY;
  delete process.env.OLLAMA_BASE_URL;
});

afterAll(() => { global.fetch = originalFetch; });

describe('authorization', () => {
  const calls: [string, () => Promise<unknown>][] = [
    ['getSetupStatus', () => getSetupStatus()],
    ['completeSetupStep', () => completeSetupStep('google')],
    ['testLlmProvider', () => testLlmProvider('openai', OPENAI_KEY)],
    ['saveLlmProvider', () => saveLlmProvider({ provider: 'openai', apiKey: OPENAI_KEY, model: 'gpt-5.6-luna' })],
    ['saveGoogleApiKey', () => saveGoogleApiKey('g-key')],
    ['saveEmailSettings', () => saveEmailSettings({ apiKey: 're_x', fromEmail: 'a@example.com' })],
    ['saveSearchApiKey', () => saveSearchApiKey('tvly-x')],
    ['saveTelegramBot', () => saveTelegramBot({ botToken: '1:abc', allowedTelegramIds: '1' })],
  ];

  it.each(calls)('%s rejects non-admins and writes nothing', async (_name, call) => {
    mockRequireAdmin.mockRejectedValue(new Error('Forbidden'));
    await expect(call()).rejects.toThrow('Forbidden');
    expect(mockSysSet).not.toHaveBeenCalled();
    expect(mockSaveSelectedModel).not.toHaveBeenCalled();
    expect(mockCreateBot).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('LLM step', () => {
  it('stores the key encrypted-at-rest via system settings and the model as selected_model', async () => {
    mockFetch.mockResolvedValue(json({ data: [] }));
    const result = await saveLlmProvider({ provider: 'openai', apiKey: ` ${OPENAI_KEY} `, model: 'gpt-5.6-luna' });
    expect(result).toEqual({ success: true, model: 'gpt-5.6-luna' });
    expect(mockSysSet).toHaveBeenCalledWith('openai_api_key', OPENAI_KEY, admin.id);
    expect(mockSaveSelectedModel).toHaveBeenCalledWith(admin.id, 'gpt-5.6-luna');
    expect(mockCookies.get('setup_steps')).toContain('llm');
    expect(JSON.stringify(result)).not.toContain(OPENAI_KEY);
  });

  it('saves nothing when the connection test fails', async () => {
    mockFetch.mockResolvedValue(json({}, 401));
    const result = await saveLlmProvider({ provider: 'anthropic', apiKey: 'bad', model: 'claude-sonnet-4-6' });
    expect(result).toEqual({ success: false, error: 'Invalid or unauthorized key' });
    expect(mockSysSet).not.toHaveBeenCalled();
    expect(mockSaveSelectedModel).not.toHaveBeenCalled();
    expect(mockCookies.has('setup_steps')).toBe(false);
  });

  it('rejects a model from another provider', async () => {
    const result = await saveLlmProvider({ provider: 'openai', apiKey: OPENAI_KEY, model: 'claude-sonnet-4-6' });
    expect(result.success).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('re-tests the stored key when none is pasted', async () => {
    mockSystemStore.set('anthropic_api_key', 'stored-anthropic');
    mockFetch.mockResolvedValue(json({ data: [] }));
    const result = await testLlmProvider('anthropic');
    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/models', expect.objectContaining({
      headers: expect.objectContaining({ 'x-api-key': 'stored-anthropic' }),
    }));
    expect(JSON.stringify(result)).not.toContain('stored-anthropic');
  });

  it('explains a missing Ollama host instead of throwing', async () => {
    mockFetch.mockRejectedValue(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }));
    const result = await testLlmProvider('ollama');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/could not be resolved/);
      expect(result.error).toMatch(/cloud provider/);
    }
  });

  it('only offers installed Ollama models', async () => {
    mockFetch.mockResolvedValue(json({ models: [{ name: 'gemma4:latest' }] }));
    const result = await testLlmProvider('ollama');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.defaultModel).toBe('gemma4');
      expect(result.models.find(m => m.id === 'qwen2.5:3b')?.available).toBe(false);
    }
    const saved = await saveLlmProvider({ provider: 'ollama', model: 'qwen2.5:3b' });
    expect(saved.success).toBe(false);
    expect(mockSaveSelectedModel).not.toHaveBeenCalled();
  });

  it('cannot be skipped', async () => {
    const result = await completeSetupStep('llm');
    expect(result.success).toBe(false);
    expect(mockCookies.has('setup_steps')).toBe(false);
  });
});

describe('status', () => {
  it('reports configured state without secrets and resumes at the first incomplete step', async () => {
    mockSystemStore.set('openai_api_key', OPENAI_KEY);
    mockSystemStore.set('resend_api_key', 're_secret_value');
    mockSystemStore.set('resend_from_email', 'Allerac <hi@example.com>');
    mockSelectedModel = 'gpt-5.6-luna';
    mockCookies.set('setup_steps', 'language,llm,bogus');
    mockQuery.mockResolvedValue({ rows: [{ bot_username: 'allerac_bot' }] });

    const status = await getSetupStatus();
    expect(status.doneSteps).toEqual(['language', 'llm']);
    expect(status.llm).toMatchObject({ provider: 'openai', model: 'gpt-5.6-luna', keys: { openai: true, anthropic: false } });
    expect(status.email).toEqual({ apiKeyConfigured: true, fromEmail: 'Allerac <hi@example.com>' });
    expect(status.telegram).toEqual({ configured: true, botUsername: 'allerac_bot' });
    expect(status.embedding).toMatchObject({ provider: 'ollama', dimensions: 768 });
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain(OPENAI_KEY);
    expect(serialized).not.toContain('re_secret_value');
  });

  it('does not count the LLM step as done without a usable provider', async () => {
    mockCookies.set('setup_steps', 'language,llm');
    mockSelectedModel = 'claude-sonnet-4-6';
    const status = await getSetupStatus();
    expect(status.doneSteps).toEqual(['language']);
  });
});

describe('optional steps', () => {
  it('skip marks the step done without writing settings', async () => {
    await expect(completeSetupStep('google')).resolves.toEqual({ success: true });
    await expect(completeSetupStep('telegram')).resolves.toEqual({ success: true });
    expect(mockCookies.get('setup_steps')).toBe('google,telegram');
    expect(mockSysSet).not.toHaveBeenCalled();
  });

  it('Google key is validated, then stored', async () => {
    mockFetch.mockResolvedValue(json({ models: [] }));
    await expect(saveGoogleApiKey('g-key')).resolves.toEqual({ success: true });
    expect(mockSysSet).toHaveBeenCalledWith('google_api_key', 'g-key', admin.id);
  });

  it('search key is validated, then stored', async () => {
    mockFetch.mockResolvedValue(json({}, 401));
    await expect(saveSearchApiKey('bad')).resolves.toEqual({ success: false, error: 'Invalid or unauthorized key' });
    mockFetch.mockResolvedValue(json({ results: [] }));
    await expect(saveSearchApiKey('tvly-good')).resolves.toEqual({ success: true });
    expect(mockSysSet).toHaveBeenCalledWith('tavily_api_key', 'tvly-good', admin.id);
  });

  it('email keeps a stored key when none is pasted and validates the sender', async () => {
    await expect(saveEmailSettings({ fromEmail: 'hi@example.com' })).resolves.toEqual({ success: false, error: 'Paste an API key first' });
    mockSystemStore.set('resend_api_key', 're_stored');
    await expect(saveEmailSettings({ fromEmail: 'not-an-email' })).resolves.toMatchObject({ success: false });
    await expect(saveEmailSettings({ fromEmail: 'Allerac <hi@example.com>' })).resolves.toEqual({ success: true });
    expect(mockSysSet).toHaveBeenCalledTimes(1);
    expect(mockSysSet).toHaveBeenCalledWith('resend_from_email', 'Allerac <hi@example.com>', admin.id);
  });

  it('Telegram bot is checked with Telegram and created for the admin', async () => {
    await expect(saveTelegramBot({ botToken: 'nope', allowedTelegramIds: '1' })).resolves.toMatchObject({ success: false });
    await expect(saveTelegramBot({ botToken: '123:abc', allowedTelegramIds: 'x' })).resolves.toMatchObject({ success: false });
    mockFetch.mockResolvedValue(json({ ok: true, result: { username: 'allerac_bot' } }));
    const result = await saveTelegramBot({ botToken: '123:abc_DEF', allowedTelegramIds: '111, 222' });
    expect(result).toEqual({ success: true, botUsername: 'allerac_bot' });
    expect(mockCreateBot).toHaveBeenCalledWith(admin.id, 'Allerac', '123:abc_DEF', [111, 222], 'allerac_bot');
    expect(JSON.stringify(result)).not.toContain('123:abc_DEF');
  });

  it('Telegram reports a missing server encryption key clearly', async () => {
    mockFetch.mockResolvedValue(json({ ok: true, result: { username: 'b' } }));
    mockCreateBot.mockRejectedValue(new Error('TELEGRAM_TOKEN_ENCRYPTION_KEY must contain at least 32 characters'));
    const result = await saveTelegramBot({ botToken: '123:abc', allowedTelegramIds: '1' });
    expect(result).toEqual({ success: false, error: expect.stringMatching(/not enabled on this server/) });
  });
});
