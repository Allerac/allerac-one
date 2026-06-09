jest.mock('@/app/clients/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));
jest.mock('@/app/services/user/user-settings.service', () => ({
  UserSettingsService: jest.fn(),
}));
jest.mock('@/app/services/system/system-settings.service', () => ({
  SystemSettingsService: jest.fn(),
}));

import pool from '@/app/clients/db';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';

const loadUserSettings = jest.fn();
const loadAll = jest.fn();

(UserSettingsService as jest.Mock).mockImplementation(() => ({ loadUserSettings }));
(SystemSettingsService as jest.Mock).mockImplementation(() => ({ loadAll }));

const {
  ChatProviderConfigurationError,
  loadChatRuntimeContext,
} = require('@/app/services/chat/chat-runtime-context');

describe('loadChatRuntimeContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadUserSettings.mockResolvedValue({});
    loadAll.mockResolvedValue({});
    (pool.query as jest.Mock).mockResolvedValue({ rows: [] });
  });

  test('prefers user keys and domain instructions', async () => {
    loadUserSettings.mockResolvedValue({
      github_token: 'user-github',
      system_message: 'global instructions',
      location: 'Madrid',
    });
    loadAll.mockResolvedValue({ github_token: 'system-github' });
    (pool.query as jest.Mock).mockResolvedValue({
      rows: [{ content: 'domain instructions' }],
    });

    await expect(loadChatRuntimeContext('user-1', 'code', 'github'))
      .resolves.toEqual(expect.objectContaining({
        githubToken: 'user-github',
        userInstructions: 'domain instructions',
        userLocation: 'Madrid',
      }));
  });

  test.each([
    ['gemini', 'Google API key'],
    ['anthropic', 'Anthropic API key'],
  ])('rejects %s when its provider key is missing', async (provider, message) => {
    await expect(loadChatRuntimeContext('user-1', 'chat', provider))
      .rejects.toEqual(expect.objectContaining({
        name: ChatProviderConfigurationError.name,
        message: expect.stringContaining(message),
      }));
  });
});
