/** @jest-environment node */

import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { ApiKeyMissingScopeError, apiKeyService } from '@/app/services/api-keys/api-key.service';
import { GET } from '@/app/api/v1/capabilities/route';

var mockLoadForUser: jest.Mock;

jest.mock('@/app/lib/auth-session', () => {
  class MockUnauthorizedError extends Error {}
  class MockForbiddenError extends Error {}
  return {
    UnauthorizedError: MockUnauthorizedError,
    ForbiddenError: MockForbiddenError,
    requireCurrentUser: jest.fn(),
  };
});

jest.mock('@/app/services/api-keys/api-key.service', () => ({
  ApiKeyMissingScopeError: class MockApiKeyMissingScopeError extends Error {
    constructor(public readonly requiredScope: string) {
      super(`API key is missing required scope: ${requiredScope}`);
      this.name = 'ApiKeyMissingScopeError';
    }
  },
  apiKeyService: {
    validateBearerToken: jest.fn(),
  },
}));

jest.mock('@/app/services/capabilities/capabilities.service', () => ({
  CapabilitiesService: jest.fn(() => {
    if (!mockLoadForUser) {
      mockLoadForUser = jest.fn();
    }
    return { loadForUser: mockLoadForUser };
  }),
}));

const mockRequireCurrentUser = jest.mocked(requireCurrentUser);
const mockApiKeyService = jest.mocked(apiKeyService);

const user = {
  id: 'user-id',
  email: 'user@example.com',
  name: 'User',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

const capabilities = {
  capabilities: {
    llm: {
      github: { configured: true, available: true },
      gemini: { configured: true, available: true },
      anthropic: { configured: false, available: false },
      ollama: { configured: true, connected: true, available: true },
    },
    search: { tavily: { configured: true, available: true } },
    notifications: {
      telegram: { configured: false, available: false },
      resend: { configured: false, available: false },
    },
    storage: { azureBlob: { configured: false, available: false } },
    social: {
      instagram: { configured: false, connected: false, available: false },
      tiktok: { configured: false, connected: false, available: false },
    },
    email: {
      imap: { configured: false, available: false },
      smtp: { configured: false, available: false },
    },
    health: {
      garmin: { configured: false, connected: false, available: false },
    },
  },
  defaults: { chatModel: 'gemini-2.5-flash' },
};

describe('Control API v1 capabilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue(user);
    mockLoadForUser.mockResolvedValue(capabilities);
  });

  it('returns capabilities for the current browser session user', async () => {
    const response = await GET(new Request('http://localhost/api/v1/capabilities'));

    expect(response.status).toBe(200);
    expect(mockLoadForUser).toHaveBeenCalledWith('user-id');
    expect(await response.json()).toEqual({ data: capabilities });
  });

  it('accepts API keys with capabilities:read scope', async () => {
    mockApiKeyService.validateBearerToken.mockResolvedValueOnce(user);

    const response = await GET(new Request('http://localhost/api/v1/capabilities', {
      headers: { Authorization: 'Bearer alr_live_secret' },
    }));

    expect(response.status).toBe(200);
    expect(mockApiKeyService.validateBearerToken).toHaveBeenCalledWith('alr_live_secret', 'capabilities:read');
    expect(mockLoadForUser).toHaveBeenCalledWith('user-id');
  });

  it('requires capabilities:read for API keys', async () => {
    mockApiKeyService.validateBearerToken.mockRejectedValueOnce(
      new ApiKeyMissingScopeError('capabilities:read'),
    );

    const response = await GET(new Request('http://localhost/api/v1/capabilities', {
      headers: { Authorization: 'Bearer alr_live_limited' },
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'missing_scope',
        details: { requiredScope: 'capabilities:read' },
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());

    const response = await GET(new Request('http://localhost/api/v1/capabilities'));

    expect(response.status).toBe(401);
    expect(mockLoadForUser).not.toHaveBeenCalled();
  });
});
