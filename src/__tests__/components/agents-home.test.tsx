/**
 * Phase 2: home = agents screen. `/` redirect, `/agents` index pick, the local
 * agent row, Configure links and the single-agent duplicate-name fix.
 */
import type React from 'react';
import { render, screen, within } from '@testing-library/react';
import AgentsInboxSection from '@/app/components/inbox/AgentsInboxSection';
import AgentShell from '@/app/agents/_shell/AgentShell';
import {
  agentSubtitle, agentTitle, fallbackSelfAgent, flattenAgents, peerConfigureUrl, pickIndexHref, sameName, selfAgent,
  type AgentItem,
} from '@/app/components/inbox/agents-format';

const push = jest.fn();
const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace, refresh: jest.fn() }) }));
jest.mock('next/link', () => {
  const MockLink = ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>;
  MockLink.displayName = 'MockLink';
  return MockLink;
});
jest.mock('@/app/context/ThemeContext', () => ({ useTheme: () => ({ isDark: false }) }));

const listing = () => ({
  home: {
    name: 'napols', displayName: 'Napols', emoji: '🍕', role: 'Home base', agents: [],
    agent: { slug: 'chat', name: 'Napols', emoji: '🍕', role: 'Home base', href: '/agents/self/agent', configureUrl: '/hub/settings' },
  },
  units: [
    {
      peerId: 'p1', name: 'santos', displayName: 'Santos - Health Assistant', emoji: null, role: 'Health', status: 'online',
      configureUrl: 'https://santos.example/hub/settings',
      agents: [{ slug: 'chat', name: ' santos - health assistant ', description: null, threadId: null, threads: [], preview: null, lastMessageAt: '2026-01-02T00:00:00Z', unread: 0, available: true }],
    },
    {
      peerId: 'p3', name: 'barcelona', displayName: 'Barcelona', emoji: null, role: null, status: 'online', configureUrl: 'https://barcelona.example/hub/settings',
      agents: [{ slug: 'coach', name: 'Coach', description: null, threadId: null, threads: [], preview: null, lastMessageAt: '2026-01-01T00:00:00Z', unread: 0, available: true }],
    },
  ],
  archived: [],
});

const fakeResponse = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
let units: ReturnType<typeof listing>['units'];

beforeEach(() => {
  push.mockReset(); replace.mockReset();
  units = listing().units;
  global.fetch = ((url: string) => {
    if (url.startsWith('/api/inbox/updates')) return Promise.resolve(fakeResponse({ data: { totalUnread: 0, threads: [], serverTime: '2026-01-01T00:00:00Z' } }));
    if (url.startsWith('/api/inbox/agents')) return Promise.resolve(fakeResponse({ data: { ...listing(), units } }));
    return Promise.resolve(fakeResponse({ error: 'not found' }, 404));
  }) as unknown as typeof fetch;
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const items = () => flattenAgents(listing() as any, null);

describe('duplicate-name fix', () => {
  it('compares names case/trim-insensitively', () => {
    expect(sameName(' Santos - Health Assistant ', 'santos - health assistant')).toBe(true);
    expect(sameName('Coach', 'Barcelona')).toBe(false);
    expect(sameName('', '')).toBe(false);
  });
  it('shows the name once in the title and subtitle when equal', () => {
    expect(agentTitle('Santos - Health Assistant', 'santos - health assistant ')).toBe('Santos - Health Assistant');
    expect(agentTitle('Coach', 'Barcelona')).toBe('Coach · Barcelona');
    const [santos] = items();
    expect(agentSubtitle(santos)).toBe('Health');
    expect(agentSubtitle({ ...santos, roleShort: null })).toBe('Santos - Health Assistant');
  });
});

describe('configureUrl', () => {
  it('builds the settings link from a peer origin only', () => {
    expect(peerConfigureUrl('https://santos.example')).toBe('https://santos.example/hub/settings');
    expect(peerConfigureUrl('https://user:pw@santos.example:8443/some/path?k=1')).toBe('https://santos.example:8443/hub/settings');
    expect(peerConfigureUrl('javascript:alert(1)')).toBeNull();
    expect(peerConfigureUrl('not a url')).toBeNull();
    expect(peerConfigureUrl(null)).toBeNull();
  });
  it('is carried to agent rows and the local row', () => {
    expect(items().map(item => item.configureUrl)).toEqual(['https://santos.example/hub/settings', 'https://barcelona.example/hub/settings']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(selfAgent(listing() as any)).toMatchObject({ href: '/agents/self/agent', configureUrl: '/hub/settings' });
    expect(fallbackSelfAgent('Napols')).toMatchObject({ name: 'Napols', href: '/agents/self/agent', configureUrl: '/hub/settings' });
  });
});

describe('index pick', () => {
  const agents = (): AgentItem[] => items();
  it('opens the remote agent with the most recent activity', () => {
    expect(pickIndexHref(agents(), null)).toBe('/agents/santos/chat');
    const reordered = agents().map(agent => (agent.slug === 'coach' ? { ...agent, lastMessageAt: '2026-03-01T00:00:00Z' } : agent));
    expect(pickIndexHref(reordered, '2026-02-01T00:00:00Z')).toBe('/agents/barcelona/coach');
  });
  it('opens the local agent when it is the most recent, or nothing has activity', () => {
    expect(pickIndexHref(agents(), '2026-05-01T00:00:00Z')).toBe('/agents/self/agent');
    expect(pickIndexHref(agents().map(agent => ({ ...agent, lastMessageAt: null })), null)).toBe('/agents/self/agent');
    expect(pickIndexHref([], null)).toBe('/agents/self/agent');
  });
});

describe('local row', () => {
  it('always shows first, even without paired units, with a local Configure link', async () => {
    units = [];
    render(<AgentsInboxSection isDark={false} domainId="chat" />);
    const self = await screen.findByTestId('agent-self');
    expect(within(self).getByText('Napols')).toBeInTheDocument();
    const configure = screen.getByTestId('agent-configure');
    expect(configure).toHaveAttribute('href', '/hub/settings');
    expect(configure).not.toHaveAttribute('target');
    self.click();
    expect(push).toHaveBeenCalledWith('/agents/self/agent');
  });
  it('lists remote agents after it with their own Configure links (new tab)', async () => {
    render(<AgentsInboxSection isDark={false} domainId="chat" />);
    await screen.findByTestId('agent-santos/chat');
    const links = screen.getAllByTestId('agent-configure');
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/hub/settings', 'https://santos.example/hub/settings', 'https://barcelona.example/hub/settings',
    ]);
    expect(links[1]).toHaveAttribute('target', '_blank');
    expect(links[1]).toHaveAttribute('rel', 'noopener noreferrer');
    const santos = screen.getByTestId('agent-santos/chat');
    expect(within(santos).getAllByText(/santos - health assistant/i)).toHaveLength(1);
  });
  it('shows only the local row to non-admins (no inbox calls)', () => {
    const spy = jest.spyOn(global, 'fetch');
    render(<AgentShell activeKey="self" isAdmin={false} localName="Napols">{() => <p>chat</p>}</AgentShell>);
    expect(screen.getAllByTestId('agent-self')[0]).toHaveTextContent('Napols');
    expect(screen.queryByText('Hub')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
