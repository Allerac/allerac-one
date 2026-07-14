/** @jest-environment node */

import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { GET } from '@/app/api/v1/search/route';
import { SearchWebTool } from '@/app/tools/search-web.tool';

var mockLoadUserSettings = jest.fn();
var mockLoadSystemSettings = jest.fn();
var mockExecuteSearch = jest.fn();

jest.mock('@/app/lib/auth-session', () => {
  class MockUnauthorizedError extends Error {}
  class MockForbiddenError extends Error {}
  return {
    UnauthorizedError: MockUnauthorizedError,
    ForbiddenError: MockForbiddenError,
    requireCurrentUser: jest.fn(),
    assertDomainAccess: jest.fn(),
  };
});

jest.mock('@/app/services/user/user-settings.service', () => ({
  UserSettingsService: jest.fn().mockImplementation(() => ({
    loadUserSettings: mockLoadUserSettings,
  })),
}));

jest.mock('@/app/services/system/system-settings.service', () => ({
  SystemSettingsService: jest.fn().mockImplementation(() => ({
    loadAll: mockLoadSystemSettings,
  })),
}));

jest.mock('@/app/tools/search-web.tool', () => ({
  SearchWebTool: jest.fn().mockImplementation(() => ({
    execute: mockExecuteSearch,
  })),
}));

const mockRequireCurrentUser = jest.mocked(requireCurrentUser);

const user = {
  id: 'user-id',
  email: 'user@example.com',
  name: 'User',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

describe('Control API v1 search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadUserSettings.mockReset();
    mockLoadSystemSettings.mockReset();
    mockExecuteSearch.mockReset();
    mockRequireCurrentUser.mockResolvedValue(user);
    mockLoadUserSettings.mockResolvedValue({});
    mockLoadSystemSettings.mockResolvedValue({ tavily_api_key: 'system-tavily', github_token: 'system-github' });
    mockExecuteSearch.mockResolvedValue({
      answer: 'Result answer',
      results: [{ title: 'Example', url: 'https://example.com', content: 'Content', score: 0.9 }],
      query: 'allerac',
    });
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());

    const response = await GET(new Request('http://localhost/api/v1/search?q=allerac'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: 'unauthorized', message: 'Unauthorized' } });
  });

  it('runs web search with configured provider', async () => {
    const response = await GET(new Request('http://localhost/api/v1/search?q=allerac'));

    expect(response.status).toBe(200);
    expect(SearchWebTool).toHaveBeenCalledWith('system-tavily', 'system-github');
    expect(mockExecuteSearch).toHaveBeenCalledWith('allerac');
    expect(await response.json()).toEqual({
      data: {
        search: {
          answer: 'Result answer',
          results: [{ title: 'Example', url: 'https://example.com', content: 'Content', score: 0.9 }],
          query: 'allerac',
        },
      },
    });
  });

  it('validates missing query', async () => {
    const response = await GET(new Request('http://localhost/api/v1/search'));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
    expect(SearchWebTool).not.toHaveBeenCalled();
  });

  it('returns 422 when Tavily is not configured', async () => {
    mockLoadUserSettings.mockResolvedValueOnce({});
    mockLoadSystemSettings.mockResolvedValueOnce({});

    const response = await GET(new Request('http://localhost/api/v1/search?q=allerac'));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: { code: 'provider_not_configured', message: 'Tavily API key is not configured.' },
    });
  });
});
