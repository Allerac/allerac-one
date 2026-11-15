/** @jest-environment node */

import '../__mocks__/db';
import { requireCurrentAdmin } from '@/app/lib/auth-session';
import { validateApiKey } from '@/app/actions/api-keys';
import {
  getSystemSettings,
  saveSystemSettings,
  testStoredSystemKey,
} from '@/app/actions/admin';
import {
  SystemSettingsService,
  secretSettingStatus,
  toPublicSystemSettings,
  type SystemSettings,
} from '@/app/services/system/system-settings.service';

jest.mock('@/app/lib/auth-session', () => ({ requireCurrentAdmin: jest.fn() }));
jest.mock('@/app/actions/api-keys', () => ({ validateApiKey: jest.fn() }));

const STORED: SystemSettings = {
  github_token: 'ghp_storedgithubtoken000000000001',
  github_repo_token: null,
  tavily_api_key: 'tvly-short',
  anthropic_api_key: 'sk-ant-storedanthropickey0000000002',
  google_api_key: 'AIzaStoredGoogleKey000000000003',
  openai_api_key: 'sk-storedopenaikey00000000000004',
  resend_api_key: 're_storedresendkey0000000000005',
  resend_from_email: 'noreply@example.com',
};

const SECRET_VALUES = Object.entries(STORED)
  .filter(([key, value]) => key !== 'resend_from_email' && value)
  .map(([, value]) => value as string);

function expectNoSecrets(payload: unknown) {
  const json = JSON.stringify(payload);
  for (const secret of SECRET_VALUES) {
    expect(json).not.toContain(secret);
    expect(json).not.toContain(secret.slice(0, -4));
  }
}

let loadAll: jest.SpyInstance;
let saveAll: jest.SpyInstance;
let getOne: jest.SpyInstance;

beforeEach(() => {
  jest.mocked(requireCurrentAdmin).mockResolvedValue({ id: 'admin-1', is_admin: true } as never);
  jest.mocked(validateApiKey).mockReset();
  loadAll = jest.spyOn(SystemSettingsService.prototype, 'loadAll').mockResolvedValue({ ...STORED });
  saveAll = jest.spyOn(SystemSettingsService.prototype, 'saveAll').mockResolvedValue();
  getOne = jest.spyOn(SystemSettingsService.prototype, 'get')
    .mockImplementation(async (key) => STORED[key] ?? null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('secretSettingStatus', () => {
  it('reports configuration without the value', () => {
    expect(secretSettingStatus(null)).toEqual({ configured: false, hint: null });
    expect(secretSettingStatus('   ')).toEqual({ configured: false, hint: null });
    expect(secretSettingStatus('short-key')).toEqual({ configured: true, hint: null });
    expect(secretSettingStatus('sk-abcdefghijklmnopqrstuvwxyz1234')).toEqual({ configured: true, hint: '••••1234' });
  });

  it('maps every secret to a status and keeps the sender address', () => {
    const result = toPublicSystemSettings(STORED);
    expect(result.github_repo_token).toEqual({ configured: false, hint: null });
    expect(result.tavily_api_key).toEqual({ configured: true, hint: null });
    expect(result.openai_api_key.configured).toBe(true);
    expect(result.resend_from_email).toBe('noreply@example.com');
    expectNoSecrets(result);
  });
});

describe('getSystemSettings', () => {
  it('requires an admin', async () => {
    jest.mocked(requireCurrentAdmin).mockRejectedValueOnce(new Error('Admin access required'));
    await expect(getSystemSettings()).rejects.toThrow('Admin access required');
    expect(loadAll).not.toHaveBeenCalled();
  });

  it('returns redacted settings', async () => {
    const result = await getSystemSettings();
    expectNoSecrets(result);
    expect(result.anthropic_api_key).toEqual({ configured: true, hint: '••••0002' });
    expect(result.resend_from_email).toBe('noreply@example.com');
  });
});

describe('saveSystemSettings', () => {
  it('stores new values and leaves blank secrets unchanged', async () => {
    const result = await saveSystemSettings({
      values: { openai_api_key: '  sk-new-openai  ', anthropic_api_key: '', resend_from_email: 'team@example.com' },
    });
    expect(result.success).toBe(true);
    expect(saveAll).toHaveBeenCalledWith(
      { openai_api_key: 'sk-new-openai', resend_from_email: 'team@example.com' },
      'admin-1',
    );
    if (result.success) expectNoSecrets(result.settings);
  });

  it('clears only the settings that are explicitly removed', async () => {
    await saveSystemSettings({ clear: ['tavily_api_key'] });
    expect(saveAll).toHaveBeenCalledWith({ tavily_api_key: '' }, 'admin-1');
  });

  it('clears the sender address when it is blank', async () => {
    await saveSystemSettings({ values: { resend_from_email: '' } });
    expect(saveAll).toHaveBeenCalledWith({ resend_from_email: '' }, 'admin-1');
  });

  it('rejects unknown keys and invalid values', async () => {
    expect(await saveSystemSettings({ values: { not_a_key: 'x' } as never })).toEqual({ success: false, error: 'Invalid settings' });
    expect(await saveSystemSettings({ clear: ['not_a_key'] as never })).toEqual({ success: false, error: 'Invalid settings' });
    expect(await saveSystemSettings({ values: { openai_api_key: 42 } as never })).toEqual({ success: false, error: 'Invalid settings' });
    expect(await saveSystemSettings({ values: { openai_api_key: 'x'.repeat(10_001) } })).toEqual({ success: false, error: 'Invalid settings' });
    expect(saveAll).not.toHaveBeenCalled();
  });

  it('requires an admin', async () => {
    jest.mocked(requireCurrentAdmin).mockRejectedValueOnce(new Error('Admin access required'));
    await expect(saveSystemSettings({ values: { openai_api_key: 'sk-x' } })).rejects.toThrow('Admin access required');
    expect(saveAll).not.toHaveBeenCalled();
  });
});

describe('testStoredSystemKey', () => {
  it('validates the stored key on the server and returns only the result', async () => {
    jest.mocked(validateApiKey).mockResolvedValue({ valid: true });
    const result = await testStoredSystemKey('openai');
    expect(getOne).toHaveBeenCalledWith('openai_api_key');
    expect(validateApiKey).toHaveBeenCalledWith('openai', STORED.openai_api_key);
    expect(result).toEqual({ valid: true });
  });

  it('reports a missing key without calling the provider', async () => {
    expect(await testStoredSystemKey('github-repo')).toEqual({ valid: false, error: 'No key stored' });
    expect(validateApiKey).not.toHaveBeenCalled();
  });

  it('rejects unknown providers', async () => {
    expect(await testStoredSystemKey('resend' as never)).toEqual({ valid: false, error: 'Unknown provider' });
    expect(getOne).not.toHaveBeenCalled();
  });

  it('requires an admin', async () => {
    jest.mocked(requireCurrentAdmin).mockRejectedValueOnce(new Error('Admin access required'));
    await expect(testStoredSystemKey('openai')).rejects.toThrow('Admin access required');
    expect(getOne).not.toHaveBeenCalled();
  });
});
