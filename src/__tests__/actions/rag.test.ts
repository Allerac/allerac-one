import { requireCurrentUser } from '@/app/lib/auth-session';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { VectorSearchService } from '@/app/services/rag/vector-search.service';
import { getRelevantContext } from '@/app/actions/rag';

const mockGetRelevantContext = jest.fn();

jest.mock('@/app/lib/auth-session', () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock('@/app/services/user/user-settings.service', () => ({
  UserSettingsService: jest.fn().mockImplementation(() => ({
    loadUserSettings: jest.fn(),
  })),
}));

jest.mock('@/app/services/system/system-settings.service', () => ({
  SystemSettingsService: jest.fn().mockImplementation(() => ({
    loadAll: jest.fn(),
  })),
}));

jest.mock('@/app/services/rag/embedding.service', () => ({
  EmbeddingService: jest.fn(),
}));

jest.mock('@/app/services/rag/vector-search.service', () => ({
  VectorSearchService: jest.fn().mockImplementation(() => ({
    getRelevantContext: mockGetRelevantContext,
  })),
}));

describe('RAG action authorization', () => {
  it('uses the session user and server-stored credentials', async () => {
    jest.mocked(requireCurrentUser).mockResolvedValue({
      id: 'user-a',
      email: 'a@example.com',
      name: 'User A',
      is_admin: false,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    });

    const userSettings = jest.mocked(UserSettingsService).mock.results[0].value;
    const systemSettings = jest.mocked(SystemSettingsService).mock.results[0].value;
    userSettings.loadUserSettings.mockResolvedValue({ github_token: 'server-token' });
    systemSettings.loadAll.mockResolvedValue({});

    mockGetRelevantContext.mockResolvedValue('context');

    const result = await getRelevantContext('query');

    expect(result).toBe('context');
    expect(userSettings.loadUserSettings).toHaveBeenCalledWith('user-a');
    expect(mockGetRelevantContext).toHaveBeenCalledWith('query', 'user-a');
  });
});
