/**
 * @jest-environment node
 */
const mockNotFound = jest.fn(() => { throw new Error('NEXT_NOT_FOUND'); });
const mockRedirect = jest.fn((url: string) => { throw new Error(`NEXT_REDIRECT ${url}`); });
jest.mock('next/navigation', () => ({ notFound: () => mockNotFound(), redirect: (url: string) => mockRedirect(url) }));
const mockRequireAdmin = jest.fn();
jest.mock('@/app/lib/auth-session', () => ({ requireCurrentAdmin: () => mockRequireAdmin() }));
const mockRequireDomain = jest.fn();
jest.mock('@/app/lib/domain-access', () => ({ requireDomainAccess: () => mockRequireDomain() }));
jest.mock('@/app/agents/[unit]/[agent]/AgentChatClient', () => () => null);
jest.mock('@/app/chat/ChatClient', () => () => null);
const mockGetThread = jest.fn();
jest.mock('@/federation/inbox.repository', () => ({ inboxRepository: { getThread: (...args: unknown[]) => mockGetThread(...args) } }));
const mockGetPeer = jest.fn();
jest.mock('@/federation/peer.repository', () => ({ peerRepository: { get: (...args: unknown[]) => mockGetPeer(...args) } }));

import AgentChatPage from '@/app/agents/[unit]/[agent]/page';
import ChatPage from '@/app/chat/page';

const T1 = '11111111-1111-4111-8111-111111111111';
const pageArgs = (unit: string, agent: string, thread?: string) => ({
  params: Promise.resolve({ unit, agent }), searchParams: Promise.resolve(thread ? { thread } : {}),
});

beforeEach(() => jest.clearAllMocks());

describe('/agents/[unit]/[agent]', () => {
  it('404s for non-admins', async () => {
    mockRequireAdmin.mockRejectedValueOnce(new Error('forbidden'));
    await expect(AgentChatPage(pageArgs('santos', 'chat'))).rejects.toThrow('NEXT_NOT_FOUND');
  });
  it('404s for invalid slugs', async () => {
    mockRequireAdmin.mockResolvedValueOnce({ id: 'a', is_admin: true });
    await expect(AgentChatPage(pageArgs('../etc', 'chat'))).rejects.toThrow('NEXT_NOT_FOUND');
  });
  it('renders the client with a valid thread only', async () => {
    mockRequireAdmin.mockResolvedValue({ id: 'a', is_admin: true });
    const el = await AgentChatPage(pageArgs('Santos', 'chat', T1));
    expect(el.props).toMatchObject({ unitName: 'santos', agentSlug: 'chat', threadId: T1 });
    const bad = await AgentChatPage(pageArgs('santos', 'chat', 'nope'));
    expect(bad.props.threadId).toBeNull();
  });
});

describe('/chat?inboxThread= redirect', () => {
  it('redirects admins to the agent chat view', async () => {
    mockRequireDomain.mockResolvedValueOnce({ id: 'a', is_admin: true });
    mockGetThread.mockResolvedValueOnce({ id: T1, peerId: 'p1', agentSlug: 'chat' });
    mockGetPeer.mockResolvedValueOnce({ id: 'p1', unitName: 'santos' });
    await expect(ChatPage({ searchParams: Promise.resolve({ inboxThread: T1 }) })).rejects.toThrow(`NEXT_REDIRECT /agents/santos/chat?thread=${T1}`);
  });
  it('renders the chat for unknown threads and non-admins', async () => {
    mockRequireDomain.mockResolvedValueOnce({ id: 'a', is_admin: true });
    mockGetThread.mockResolvedValueOnce(null);
    await expect(ChatPage({ searchParams: Promise.resolve({ inboxThread: T1 }) })).resolves.toBeTruthy();
    mockRequireDomain.mockResolvedValueOnce({ id: 'b', is_admin: false });
    await expect(ChatPage({ searchParams: Promise.resolve({ inboxThread: T1 }) })).resolves.toBeTruthy();
    expect(mockGetThread).toHaveBeenCalledTimes(1);
  });
});
