/** @jest-environment node */

import { assertDomainAccess, ForbiddenError, requireCurrentUser } from '@/app/lib/auth-session';
import { apiKeyService } from '@/app/services/api-keys/api-key.service';
import { GET as getRelated } from '@/app/api/v1/notes/[id]/related/route';
import { POST as promote } from '@/app/api/v1/memories/[id]/promote/route';
import { PromoteMemoryError } from '@/app/services/knowledge/promote-memory.service';

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
  ...jest.requireActual('@/app/services/api-keys/api-key.service'),
  apiKeyService: { validateBearerToken: jest.fn() },
}));
jest.mock('@/app/services/knowledge/note-related.service', () => {
  const svc = { getRelated: jest.fn() };
  (globalThis as Record<string, unknown>).__relatedSvc = svc;
  return { NoteRelatedService: jest.fn().mockImplementation(() => svc) };
});
jest.mock('@/app/services/knowledge/promote-memory.service', () => {
  const actual = jest.requireActual('@/app/services/knowledge/promote-memory.service');
  const svc = { promote: jest.fn() };
  (globalThis as Record<string, unknown>).__promoteSvc = svc;
  return { PromoteMemoryError: actual.PromoteMemoryError, PromoteMemoryService: jest.fn().mockImplementation(() => svc) };
});

const relatedSvc = () => (globalThis as Record<string, unknown>).__relatedSvc as { getRelated: jest.Mock };
const promoteSvc = () => (globalThis as Record<string, unknown>).__promoteSvc as { promote: jest.Mock };
const user = { id: 'user-id', email: 'u@example.com', name: 'U', is_admin: false, created_at: new Date() };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const note = {
  id: 'n1', user_id: 'user-id', document_id: null, title: 'T', content: 'C', tags: [], source: 'memory', due_date: null,
  parent_id: null, position: 0, icon: null, archived_at: null, created_at: new Date(), updated_at: new Date(),
};

describe('Control API knowledge: related and promote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(requireCurrentUser).mockResolvedValue(user as never);
    jest.mocked(assertDomainAccess).mockResolvedValue(undefined);
  });

  it('returns related items for a note', async () => {
    relatedSvc().getRelated.mockResolvedValue({
      semanticAvailable: true,
      notes: [{ note_id: 'n2', title: 'B', icon: null, snippet: 's', similarity: '0.8' }],
      documents: [{ document_id: 'd1', filename: 'f.pdf', domain_slug: null, similarity: 0.5 }],
      memories: [{ memory_id: 'm1', summary: 'x', key_topics: [], domain_slug: null, created_at: new Date('2026-01-01T00:00:00Z'), reason: 'shared_topic' }],
    });
    const res = await getRelated(new Request('http://localhost/api/v1/notes/n1/related?limit=3'), params('n1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.notes[0]).toEqual({ id: 'n2', title: 'B', icon: null, snippet: 's', similarity: 0.8 });
    expect(body.data.memories[0]).toMatchObject({ id: 'm1', reason: 'shared_topic', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(relatedSvc().getRelated).toHaveBeenCalledWith('user-id', 'n1', { limit: 3, isAdmin: false });
    expect(assertDomainAccess).toHaveBeenCalledWith(expect.anything(), 'notes');
  });

  it('returns 404 for unknown notes and 403 without notes access', async () => {
    relatedSvc().getRelated.mockResolvedValue(null);
    expect((await getRelated(new Request('http://localhost/api/v1/notes/x/related'), params('x'))).status).toBe(404);
    jest.mocked(assertDomainAccess).mockRejectedValueOnce(new ForbiddenError('denied'));
    expect((await getRelated(new Request('http://localhost/api/v1/notes/x/related'), params('x'))).status).toBe(403);
  });

  it('promotes a memory (201) and reports an existing page (200)', async () => {
    promoteSvc().promote.mockResolvedValueOnce({ note, alreadyPromoted: false });
    const req = () => new Request('http://localhost/api/v1/memories/m1/promote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: '11111111-1111-4111-8111-111111111111' }),
    });
    const created = await promote(req(), params('m1'));
    expect(created.status).toBe(201);
    expect(promoteSvc().promote).toHaveBeenCalledWith(
      { id: 'user-id', is_admin: false }, 'm1', { parentId: '11111111-1111-4111-8111-111111111111', title: undefined },
    );
    promoteSvc().promote.mockResolvedValueOnce({ note, alreadyPromoted: true });
    const again = await promote(req(), params('m1'));
    expect(again.status).toBe(200);
    expect((await again.json()).data.alreadyPromoted).toBe(true);
  });

  it('accepts an empty body and maps a missing memory to 404', async () => {
    promoteSvc().promote.mockRejectedValue(new PromoteMemoryError('Memory not found', 'not_found'));
    const res = await promote(new Request('http://localhost/api/v1/memories/m1/promote', { method: 'POST' }), params('m1'));
    expect(res.status).toBe(404);
  });

  it('rejects unknown fields', async () => {
    const res = await promote(new Request('http://localhost/api/v1/memories/m1/promote', {
      method: 'POST', body: JSON.stringify({ delete_memory: true }),
    }), params('m1'));
    expect(res.status).toBe(400);
  });

  it('requires notes:write and memory:read for API keys', async () => {
    jest.mocked(apiKeyService.validateBearerToken).mockResolvedValue(user as never);
    promoteSvc().promote.mockResolvedValue({ note, alreadyPromoted: false });
    await promote(new Request('http://localhost/api/v1/memories/m1/promote', {
      method: 'POST', headers: { Authorization: 'Bearer k' },
    }), params('m1'));
    const scopes = jest.mocked(apiKeyService.validateBearerToken).mock.calls.map(c => c[1]);
    expect(scopes).toEqual(['notes:write', 'memory:read']);
  });
});
