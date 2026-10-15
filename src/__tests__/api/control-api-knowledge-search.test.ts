/** @jest-environment node */

import { assertDomainAccess as sessionDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';
import { assertDomainAccess } from '@/app/lib/domain-access-check';
import { apiKeyService, ApiKeyMissingScopeError } from '@/app/services/api-keys/api-key.service';
import { GET } from '@/app/api/v1/knowledge/search/route';

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
jest.mock('@/app/lib/domain-access-check', () => ({ assertDomainAccess: jest.fn() }));
jest.mock('@/app/services/api-keys/api-key.service', () => ({
  ...jest.requireActual('@/app/services/api-keys/api-key.service'),
  apiKeyService: { validateBearerToken: jest.fn() },
}));
const search = jest.fn();
jest.mock('@/app/services/knowledge/knowledge-search.service', () => ({
  ...jest.requireActual('@/app/services/knowledge/knowledge-search.service'),
  getKnowledgeSearchService: () => ({ search }),
}));

const user = { id: 'user-id', email: 'u@example.com', name: 'U', is_admin: false, created_at: new Date() };
const hit = {
  source_type: 'note', source_id: 'n1', title: 'Editor', snippet: 's', content: 'c', domain_slug: 'notes',
  score: 0.912345, similarity: 0.9, match: 'semantic', importance: null, key_topics: null, created_at: null,
};
const req = (qs: string, token?: string) => new Request(`http://localhost/api/v1/knowledge/search?${qs}`, {
  headers: token ? { authorization: `Bearer ${token}` } : {},
});

describe('GET /api/v1/knowledge/search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(requireCurrentUser).mockResolvedValue(user as never);
    jest.mocked(sessionDomainAccess).mockResolvedValue(undefined);
    search.mockResolvedValue({ semanticAvailable: true, hits: [hit] });
  });

  it('searches all knowledge sources for a session user', async () => {
    const res = await GET(req('q=editor&limit=3'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.results[0]).toEqual(expect.objectContaining({ sourceType: 'note', sourceId: 'n1', score: 0.9123 }));
    expect(search).toHaveBeenCalledWith({ id: 'user-id', is_admin: false }, 'editor', {
      sourceTypes: ['note', 'document', 'memory'], domainSlug: null, limit: 3, includeArchived: false,
    });
    expect(sessionDomainAccess).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-id' }), 'notes');
  });

  it('rejects ticket and unknown source types', async () => {
    for (const types of ['ticket', 'memory,ticket', 'pages']) {
      const res = await GET(req(`q=x&types=${types}`));
      expect(res.status).toBe(400);
    }
    expect(search).not.toHaveBeenCalled();
  });

  it('requires the read scope of every requested source type', async () => {
    jest.mocked(apiKeyService.validateBearerToken).mockImplementation(async (_token, scope) => {
      if (scope === 'memory:read') return user as never;
      throw new ApiKeyMissingScopeError(scope);
    });
    const denied = await GET(req('q=x', 'key'));
    expect(denied.status).toBe(403);
    expect((await denied.json()).error.details.requiredScope).toBe('notes:read');

    const allowed = await GET(req('q=x&types=memory', 'key'));
    expect(allowed.status).toBe(200);
    expect(search).toHaveBeenCalledWith(expect.anything(), 'x', expect.objectContaining({ sourceTypes: ['memory'] }));
    expect(sessionDomainAccess).not.toHaveBeenCalled();
  });

  it('checks access to an explicit domain and passes include_archived', async () => {
    jest.mocked(assertDomainAccess).mockRejectedValueOnce(new (jest.requireMock('@/app/lib/auth-session').ForbiddenError)('no'));
    const forbidden = await GET(req('q=x&types=memory&domain=finance'));
    expect(forbidden.status).toBe(403);

    const ok = await GET(req('q=x&types=note&domain=notes&include_archived=true'));
    expect(ok.status).toBe(200);
    expect(search).toHaveBeenLastCalledWith(expect.anything(), 'x', expect.objectContaining({ domainSlug: 'notes', includeArchived: true }));
  });

  it('validates the query string', async () => {
    expect((await GET(req('q='))).status).toBe(400);
    expect((await GET(req('q=x&limit=99'))).status).toBe(400);
    expect((await GET(req('q=x&unknown=1'))).status).toBe(400);
  });
});
