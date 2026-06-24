/** @jest-environment node */

import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { ApiKeyMissingScopeError, apiKeyService } from '@/app/services/api-keys/api-key.service';
import { GET as getMe } from '@/app/api/v1/me/route';
import { DELETE as revokeApiKey } from '@/app/api/v1/api-keys/[id]/route';
import { GET as listApiKeys, POST as createApiKey } from '@/app/api/v1/api-keys/route';

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

jest.mock('@/app/services/api-keys/api-key.service', () => ({
  ApiKeyMissingScopeError: class MockApiKeyMissingScopeError extends Error {
    constructor(public readonly requiredScope: string) {
      super(`API key is missing required scope: ${requiredScope}`);
      this.name = 'ApiKeyMissingScopeError';
    }
  },
  apiKeyService: {
    create: jest.fn(),
    list: jest.fn(),
    revoke: jest.fn(),
    validateBearerToken: jest.fn(),
  },
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

const apiKey = {
  id: 'key-id',
  userId: user.id,
  name: 'Bruno',
  prefix: 'alr_live_abc123',
  scopes: [],
  lastUsedAt: null,
  revokedAt: null,
  expiresAt: null,
  createdAt: new Date('2026-06-24T00:00:00.000Z'),
};

function jsonRequest(url: string, method: string, body: unknown, headers?: HeadersInit): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function routeParams(id = 'key-id') {
  return { params: Promise.resolve({ id }) };
}

describe('Control API v1 API keys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue(user);
  });

  it('creates API keys from a browser session and returns the secret once', async () => {
    mockApiKeyService.create.mockResolvedValueOnce({
      apiKey,
      secret: 'alr_live_full_secret',
    });

    const response = await createApiKey(jsonRequest(
      'http://localhost/api/v1/api-keys',
      'POST',
      { name: 'Bruno' },
    ));

    expect(response.status).toBe(201);
    expect(mockApiKeyService.create).toHaveBeenCalledWith({
      userId: user.id,
      name: 'Bruno',
      scopes: undefined,
      expiresAt: null,
    });
    expect(await response.json()).toEqual({
      data: {
        apiKey: {
          id: apiKey.id,
          name: 'Bruno',
          prefix: 'alr_live_abc123',
          scopes: [],
          lastUsedAt: null,
          revokedAt: null,
          expiresAt: null,
          createdAt: '2026-06-24T00:00:00.000Z',
        },
        secret: 'alr_live_full_secret',
      },
    });
  });

  it('lists API keys without returning secrets', async () => {
    mockApiKeyService.list.mockResolvedValueOnce([apiKey]);

    const response = await listApiKeys(new Request('http://localhost/api/v1/api-keys'));

    expect(response.status).toBe(200);
    expect(mockApiKeyService.list).toHaveBeenCalledWith(user.id);
    expect(await response.json()).toMatchObject({
      data: {
        apiKeys: [{ id: apiKey.id, name: 'Bruno', prefix: 'alr_live_abc123' }],
      },
    });
  });

  it('revokes API keys by id', async () => {
    mockApiKeyService.revoke.mockResolvedValueOnce(true);

    const response = await revokeApiKey(
      new Request('http://localhost/api/v1/api-keys/key-id', { method: 'DELETE' }),
      routeParams(),
    );

    expect(response.status).toBe(200);
    expect(mockApiKeyService.revoke).toHaveBeenCalledWith({ userId: user.id, keyId: 'key-id' });
    expect(await response.json()).toEqual({ data: { revoked: true } });
  });

  it('authenticates Control API requests with Authorization Bearer API keys', async () => {
    mockApiKeyService.validateBearerToken.mockResolvedValueOnce(user);

    const response = await getMe(new Request('http://localhost/api/v1/me', {
      headers: { Authorization: 'Bearer alr_live_full_secret' },
    }));

    expect(response.status).toBe(200);
    expect(mockApiKeyService.validateBearerToken).toHaveBeenCalledWith('alr_live_full_secret', 'profile:read');
    expect(mockRequireCurrentUser).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      data: {
        user: {
          id: user.id,
          authMode: 'api_key',
        },
      },
    });
  });

  it('returns 401 when API key validation fails', async () => {
    mockApiKeyService.validateBearerToken.mockResolvedValueOnce(null);

    const response = await getMe(new Request('http://localhost/api/v1/me', {
      headers: { Authorization: 'Bearer alr_live_bad' },
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: 'unauthorized',
        message: 'Unauthorized',
      },
    });
  });

  it('returns 403 when a valid API key is missing the required scope', async () => {
    mockApiKeyService.validateBearerToken.mockRejectedValueOnce(
      new ApiKeyMissingScopeError('profile:read'),
    );

    const response = await getMe(new Request('http://localhost/api/v1/me', {
      headers: { Authorization: 'Bearer alr_live_limited_secret' },
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: 'missing_scope',
        message: 'API key does not have the required scope.',
        details: {
          requiredScope: 'profile:read',
        },
      },
    });
  });

  it('returns a stable 401 envelope when session auth is missing', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());

    const response = await listApiKeys(new Request('http://localhost/api/v1/api-keys'));

    expect(response.status).toBe(401);
    expect(mockApiKeyService.list).not.toHaveBeenCalled();
  });
});
