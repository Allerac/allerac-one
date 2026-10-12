/** @jest-environment node */

// Route-level checks that Control API v1 routes enforce API-key scopes with
// the real ApiKeyService (only the database and the session layer are mocked).

import '../__mocks__/db';
import pool from '@/app/clients/db';
import { GET as getModels } from '@/app/api/v1/models/route';
import { GET as getMe } from '@/app/api/v1/me/route';

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
    loadUserSettings: jest.fn().mockResolvedValue(null),
  })),
}));

const mockQuery = jest.mocked(pool.query) as unknown as jest.Mock;
const CHAT_CLIENT_PRESET = ['profile:read', 'chat:read', 'chat:write', 'capabilities:read'];

function keyLookup(scopes: unknown) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM control_api_keys k')) {
      return {
        rows: [{
          key_id: 'key-id',
          id: 'user-id',
          email: 'user@example.com',
          name: 'User',
          is_admin: true,
          created_at: new Date('2026-01-01T00:00:00.000Z'),
          scopes,
        }],
      };
    }
    return { rows: [], rowCount: 1 };
  });
}

function bearer(url: string): Request {
  return new Request(url, { headers: { Authorization: 'Bearer alr_live_route_scope_test' } });
}

describe('Control API v1 scope enforcement (route level)', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['empty', []],
    ['null', null],
    ['unrelated', ['tickets:read']],
    ['wildcard-looking', ['*']],
  ])('GET /api/v1/me returns 403 missing_scope for a key with %s scopes', async (_label, scopes) => {
    keyLookup(scopes);
    const response = await getMe(bearer('http://localhost/api/v1/me'));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'missing_scope' } });
  });

  it('GET /api/v1/models returns 403 for a key with empty scopes', async () => {
    keyLookup([]);
    const response = await getModels(bearer('http://localhost/api/v1/models'));
    expect(response.status).toBe(403);
  });

  it('the default "Chat client" preset still reaches /me and /models (CLI startup)', async () => {
    keyLookup(CHAT_CLIENT_PRESET);
    expect((await getMe(bearer('http://localhost/api/v1/me'))).status).toBe(200);
    expect((await getModels(bearer('http://localhost/api/v1/models'))).status).toBe(200);
  });
});
