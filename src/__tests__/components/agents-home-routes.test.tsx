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
jest.mock('@/app/agents/AgentsIndexClient', () => () => null);
jest.mock('@/app/agents/_shell/LocalAgentClient', () => () => null);
jest.mock('@/app/agents/[unit]/[agent]/AgentChatClient', () => () => null);

import RootPage from '@/app/page';
import AgentsIndexPage from '@/app/agents/page';
import AgentChatPage from '@/app/agents/[unit]/[agent]/page';

const args = (unit: string, agent: string) => ({ params: Promise.resolve({ unit, agent }), searchParams: Promise.resolve({}) });

beforeEach(() => jest.clearAllMocks());

describe('/ redirect', () => {
  it.each([true, false])('sends any signed-in user to /agents (admin=%s)', async isAdmin => {
    mockAuthed.mockResolvedValueOnce({ id: 'u', is_admin: isAdmin });
    await expect(RootPage()).rejects.toThrow('NEXT_REDIRECT /agents');
  });
  it('keeps the login redirect for signed-out users', async () => {
    mockAuthed.mockImplementationOnce(() => { throw new Error('NEXT_REDIRECT /login'); });
    await expect(RootPage()).rejects.toThrow('NEXT_REDIRECT /login');
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
    const el = await AgentChatPage(args('self', 'agent'));
    expect(mockDomain).toHaveBeenCalledWith('chat');
    expect(el.props).toMatchObject({ isAdmin: false });
  });
  it('404s for other self slugs', async () => {
    await expect(AgentChatPage(args('self', 'other'))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
