/**
 * @jest-environment node
 */
const mockRedirect = jest.fn((url: string) => { throw new Error(`NEXT_REDIRECT ${url}`); });
const mockNotFound = jest.fn(() => { throw new Error('NEXT_NOT_FOUND'); });
jest.mock('next/navigation', () => ({ redirect: (url: string) => mockRedirect(url), notFound: () => mockNotFound() }));
const mockAuthed = jest.fn();
const mockDomain = jest.fn();
jest.mock('@/app/lib/domain-access', () => ({
  requireAuthenticatedUser: () => mockAuthed(),
  requireDomainAccess: (slug: string) => mockDomain(slug),
}));
jest.mock('@/app/lib/auth-session', () => ({ requireCurrentAdmin: jest.fn() }));
const mockQuery = jest.fn();
jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: (...args: unknown[]) => mockQuery(...args) } }));
const mockCanAccess = jest.fn(async (...args: unknown[]) => args[1] === true);
const mockFirstSlug = jest.fn();
jest.mock('@/app/services/auth/auth.service', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    canAccessDomain: (userId: unknown, isAdmin: unknown, slug: unknown) => mockCanAccess(userId, isAdmin, slug),
    getFirstDomainSlug: (...a: unknown[]) => mockFirstSlug(...a),
  })),
}));
jest.mock('@/app/agents/AgentsIndexClient', () => () => null);
jest.mock('@/app/agents/_shell/LocalAgentClient', () => () => null);
jest.mock('@/app/agents/[unit]/[agent]/AgentChatClient', () => () => null);

import RootPage from '@/app/page';
import AgentsIndexPage from '@/app/agents/page';
import AgentChatPage from '@/app/agents/[unit]/[agent]/page';

const args = (unit: string, agent: string) => ({ params: Promise.resolve({ unit, agent }), searchParams: Promise.resolve({}) });

beforeEach(() => jest.clearAllMocks());

describe('/ redirect', () => {
  it('sends admins to /agents', async () => {
    mockAuthed.mockResolvedValueOnce({ id: 'u', is_admin: true });
    await expect(RootPage()).rejects.toThrow('NEXT_REDIRECT /agents');
    expect(mockCanAccess).not.toHaveBeenCalled();
  });
  it('sends non-admins with chat access to /agents', async () => {
    mockAuthed.mockResolvedValueOnce({ id: 'u', is_admin: false });
    mockCanAccess.mockResolvedValueOnce(true);
    await expect(RootPage()).rejects.toThrow('NEXT_REDIRECT /agents');
    expect(mockCanAccess).toHaveBeenCalledWith('u', false, 'chat');
  });
  it.each(['openworld', 'alleracweb'])('sends a %s-only bot account straight to /%s (no extra hops)', async slug => {
    mockAuthed.mockResolvedValueOnce({ id: 'bot', is_admin: false });
    mockCanAccess.mockResolvedValueOnce(false);
    mockFirstSlug.mockResolvedValueOnce(slug);
    await expect(RootPage()).rejects.toThrow(`NEXT_REDIRECT /${slug}`);
  });
  it('shows the no-access notice to a non-admin without any domain', async () => {
    mockAuthed.mockResolvedValueOnce({ id: 'u', is_admin: false });
    mockCanAccess.mockResolvedValueOnce(false);
    mockFirstSlug.mockResolvedValueOnce(null);
    await expect(RootPage()).rejects.toThrow('NEXT_REDIRECT /login?error=no-access');
  });
  it('keeps the login redirect for anonymous visitors', async () => {
    mockAuthed.mockImplementationOnce(() => { throw new Error('NEXT_REDIRECT /login'); });
    await expect(RootPage()).rejects.toThrow('NEXT_REDIRECT /login');
    expect(mockCanAccess).not.toHaveBeenCalled();
  });
});

describe('/agents', () => {
  it('passes the last local activity to the index for admins', async () => {
    mockAuthed.mockResolvedValueOnce({ id: 'u', is_admin: true });
    mockQuery.mockResolvedValueOnce({ rows: [{ last: new Date('2026-01-01T00:00:00Z') }] });
    const el = await AgentsIndexPage();
    expect(el.props).toEqual({ localLastActivity: '2026-01-01T00:00:00.000Z' });
    expect(mockQuery.mock.calls[0][1]).toEqual(['u']);
  });
  it('survives a DB error', async () => {
    mockAuthed.mockResolvedValueOnce({ id: 'u', is_admin: true });
    mockQuery.mockRejectedValueOnce(new Error('down'));
    jest.spyOn(console, 'error').mockImplementationOnce(() => undefined);
    expect((await AgentsIndexPage()).props.localLastActivity).toBeNull();
  });
  it('sends non-admins straight to the local agent', async () => {
    mockAuthed.mockResolvedValueOnce({ id: 'u', is_admin: false });
    await expect(AgentsIndexPage()).rejects.toThrow('NEXT_REDIRECT /agents/self/agent');
  });
});

describe('/agents/self/agent', () => {
  it('renders the embedded local chat behind chat access', async () => {
    mockDomain.mockResolvedValueOnce({ id: 'u', is_admin: false });
    mockQuery.mockResolvedValue({ rows: [] });
    const el = await AgentChatPage(args('self', 'agent'));
    expect(mockDomain).toHaveBeenCalledWith('chat');
    expect(el.props).toMatchObject({ isAdmin: false, pages: [] });
  });
  it('lists the enabled data pages in the Pages menu for admins', async () => {
    mockDomain.mockResolvedValueOnce({ id: 'u', is_admin: true });
    const el = await AgentChatPage(args('self', 'agent'));
    expect(el.props.pages).toEqual(expect.arrayContaining([{ path: '/notes', label: 'Notes', icon: '📝' }]));
  });
  it('404s for other self slugs', async () => {
    await expect(AgentChatPage(args('self', 'other'))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
