import type React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AgentsInboxSection from '@/app/components/inbox/AgentsInboxSection';
import AgentChatClient from '@/app/agents/[unit]/[agent]/AgentChatClient';
import MarkdownContent from '@/app/components/chat/MarkdownContent';
import { agentHref, compareAgents, flattenAgents, roleShort } from '@/app/components/inbox/agents-format';

const push = jest.fn();
const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace, refresh: jest.fn() }) }));
jest.mock('next/link', () => {
  const MockLink = ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>;
  MockLink.displayName = 'MockLink';
  return MockLink;
});
// react-markdown is ESM-only under Jest; capture its props to check the untrusted-content settings.
const markdownProps: Array<Record<string, unknown>> = [];
jest.mock('react-markdown', () => {
  const MockMarkdown = (props: { children: string }) => { markdownProps.push(props); return <div data-testid="markdown">{props.children}</div>; };
  MockMarkdown.displayName = 'MockMarkdown';
  return { __esModule: true, default: MockMarkdown, defaultUrlTransform: (url: string) => url };
});
jest.mock('remark-gfm', () => ({ __esModule: true, default: () => undefined }));
jest.mock('react-syntax-highlighter', () => ({ Prism: () => null }));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({ oneDark: {}, oneLight: {} }));
jest.mock('@/app/context/ThemeContext', () => ({ useTheme: () => ({ isDarkMode: false, toggleDarkMode: jest.fn() }) }));

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const T3 = '33333333-3333-4333-8333-333333333333';

const listing = () => ({
  home: { name: 'napols', displayName: 'Napols', emoji: '🍕', role: 'Home base, family', agents: [], agent: { slug: 'chat', name: 'Napols', emoji: '🍕', role: 'Home base, family', href: '/chat' } },
  units: [
    {
      peerId: 'p1', name: 'santos', displayName: 'Santos', emoji: '🏖️', role: 'Beach lab, research and long-form notes for the team', status: 'online',
      agents: [{
        slug: 'chat', name: 'Santos Chat', description: null, threadId: T1, preview: 'last reply', lastMessageAt: '2026-01-01T00:00:00Z', unread: 2, available: true,
        threads: [
          { threadId: T1, title: null, isDefault: true, preview: 'last reply', lastMessageAt: '2026-01-01T00:00:00Z', unread: 2 },
          { threadId: T2, title: 'Trip plans', isDefault: false, preview: null, lastMessageAt: null, unread: 1 },
        ],
      }],
    },
    {
      peerId: 'p3', name: 'barcelona', displayName: 'Barcelona', emoji: '⚽', role: 'Sports', status: 'degraded',
      agents: [{ slug: 'coach', name: 'Coach', description: null, threadId: null, preview: null, lastMessageAt: '2026-02-01T00:00:00Z', unread: 0, available: true, threads: [] }],
    },
  ],
  archived: [{ peerId: 'p2', name: 'lisbon', displayName: 'Lisbon', threads: [{ threadId: T3, agentSlug: 'chat', title: 'Old chat', lastMessageAt: null, preview: null }] }],
});

const msg = (id: string, role: string, content: string, status = 'done', extra: Record<string, unknown> = {}) =>
  ({ id, role, content, status, truncated: false, errorCode: null, createdAt: '2026-01-01T00:00:00Z', ...extra });

const threadView = (id = T1, overrides: Record<string, unknown> = {}) => ({
  thread: { id, agentSlug: 'chat', title: id === T2 ? 'Trip plans' : null },
  unit: { peerId: 'p1', name: 'santos', displayName: 'Santos' },
  readOnly: false, nextCursor: null,
  messages: [msg('m1', 'user', 'hi'), msg('m2', 'agent', '**bold** reply')],
  ...overrides,
});

const fakeResponse = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const ok = (data: unknown) => Promise.resolve(fakeResponse({ data }));

type Route = (url: string, init?: RequestInit) => unknown | undefined;
let routes: Route[];
let calls: Array<[string, RequestInit | undefined]>;
const route = (fn: Route) => { routes.unshift(fn); };

beforeEach(() => {
  push.mockReset(); replace.mockReset();
  calls = [];
  routes = [
    url => (url.startsWith('/api/inbox/updates') ? { totalUnread: 3, threads: [], serverTime: '2026-01-01T00:00:00Z' } : undefined),
    url => (url.startsWith('/api/inbox/agents') ? listing() : undefined),
    (url, init) => (url.startsWith(`/api/inbox/threads/${T1}?`) && !init?.method ? threadView(T1) : undefined),
    (url, init) => (url.startsWith(`/api/inbox/threads/${T2}?`) && !init?.method ? threadView(T2) : undefined),
  ];
  global.fetch = ((url: string, init?: RequestInit) => {
    calls.push([url, init]);
    for (const fn of routes) {
      const data = fn(url, init);
      if (data !== undefined) return ok(data);
    }
    return Promise.resolve(fakeResponse({ error: 'not found' }, 404));
  }) as unknown as typeof fetch;
});

describe('agents-format', () => {
  it('shortens roles and builds links', () => {
    expect(roleShort('Beach lab, research and notes')).toBe('Beach lab');
    expect(roleShort('A very long role without any separators at all')).toHaveLength(24);
    expect(agentHref('santos', 'chat')).toBe('/agents/santos/chat');
    expect(agentHref('santos', 'chat', T1)).toBe(`/agents/santos/chat?thread=${T1}`);
  });
  it('flattens units, unread first then most recent', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = flattenAgents(listing() as any, null);
    expect(items.map(item => item.key)).toEqual(['santos/chat', 'barcelona/coach']);
    expect(items[0].unread).toBe(3);
    expect([...items].reverse().sort(compareAgents)[0].key).toBe('santos/chat');
  });
});

describe('AgentsInboxSection', () => {
  it('shows only the role for a single-agent peer named after its Unit', async () => {
    route(url => {
      if (!url.startsWith('/api/inbox/agents')) return undefined;
      const value = listing();
      value.units[1].agents[0].name = 'Barcelona';
      return value;
    });
    render(<AgentsInboxSection isDark={false} domainId="chat" />);
    const row = await screen.findByTestId('agent-barcelona/coach');
    expect(within(row).getByText('Sports')).toBeInTheDocument();
    expect(within(row).queryByText(/⚽ Barcelona ·/)).toBeNull();
  });

  it('shows a flat list without local domains, with unit, short role, status and badges', async () => {
    render(<AgentsInboxSection isDark={false} domainId="chat" />);
    const row = await screen.findByTestId('agent-santos/chat');
    expect(within(row).getByText(/🏖️ Santos · Beach lab/)).toBeInTheDocument();
    expect(within(row).getByTestId('unread')).toHaveTextContent('3');
    expect(within(row).getByTestId('status-dot')).toHaveAttribute('data-status', 'online');
    expect(within(screen.getByTestId('agent-barcelona/coach')).getByTestId('status-dot')).toHaveAttribute('data-status', 'degraded');
    expect(screen.getByTestId('total-unread')).toHaveTextContent('3');
    // Local domains are not listed; this Unit's own agent comes first.
    expect(screen.queryByText('Health')).toBeNull();
    const all = screen.getAllByTestId(/^agent-(self|.+\/.+)$/).map(el => el.getAttribute('data-testid'));
    expect(all[0]).toBe('agent-self');
    const self = screen.getByTestId('agent-self');
    expect(within(self).getByText('Napols')).toBeInTheDocument();
    expect(within(self).getByText('This Unit · Home base')).toBeInTheDocument();
    expect(within(self).queryByTestId('unread')).toBeNull();
    fireEvent.click(self);
    expect(push).toHaveBeenCalledWith('/chat');
    push.mockReset();
    const ids = screen.getAllByTestId(/^agent-.+\//).map(el => el.getAttribute('data-testid'));
    expect(ids).toEqual(['agent-santos/chat', 'agent-barcelona/coach']);

    fireEvent.click(row);
    expect(push).toHaveBeenCalledWith('/agents/santos/chat');
  });

  it('marks pending replies from updates and folds archived threads', async () => {
    route(url => (url.startsWith('/api/inbox/updates')
      ? { totalUnread: 0, threads: [{ threadId: T2, unread: 1, pending: true, lastMessageAt: '2026-03-01T00:00:00Z', preview: null }], serverTime: '2026-03-01T00:00:00Z' }
      : undefined));
    const onNavigate = jest.fn();
    render(<AgentsInboxSection isDark={false} domainId="chat" onNavigate={onNavigate} />);
    expect(await screen.findByTestId('pending')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Archived \(1\)/));
    fireEvent.click(screen.getByTestId('archived-thread'));
    expect(push).toHaveBeenCalledWith(`/agents/lisbon/chat?thread=${T3}`);
    expect(onNavigate).toHaveBeenCalled();
  });

  it('shows only avatars and badges when collapsed', async () => {
    render(<AgentsInboxSection isDark={false} domainId="chat" collapsed />);
    const row = await screen.findByTestId('agent-santos/chat');
    expect(within(row).queryByText(/Santos ·/)).toBeNull();
    expect(within(row).getByTestId('unread')).toHaveTextContent('3');
  });
});

describe('MarkdownContent (untrusted)', () => {
  beforeEach(() => { markdownProps.length = 0; });
  it('drops raw HTML, blocks unsafe links and renders images as links', () => {
    render(<MarkdownContent isDarkMode={false} untrusted content="<img src=x onerror=alert(1)>" />);
    const props = markdownProps[0] as { skipHtml: boolean; urlTransform: (url: string) => string; components: Record<string, (p: object) => React.ReactElement> };
    expect(props.skipHtml).toBe(true);
    expect(props.urlTransform('javascript:alert(1)')).toBe('');
    expect(props.urlTransform('data:text/html,x')).toBe('');
    expect(props.urlTransform('https://example.com')).toBe('https://example.com');
    expect(props.urlTransform('mailto:a@b.c')).toBe('mailto:a@b.c');
    const { container } = render(props.components.img({ src: 'https://example.com/a.png', alt: 'pic' }));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toHaveAttribute('href', 'https://example.com/a.png');
    const link = render(props.components.a({ href: '', children: 'bad' }));
    expect(link.container.querySelector('a')).toBeNull();
  });
  it('keeps the trusted defaults for local chat', () => {
    render(<MarkdownContent isDarkMode={false} content="hi" />);
    const props = markdownProps[0] as { skipHtml: boolean; components: Record<string, unknown> };
    expect(props.skipHtml).toBe(false);
    expect(props.components.img).toBeUndefined();
  });
});

describe('AgentChatClient', () => {
  it('opens the default thread with header, markdown reply and thread switcher', async () => {
    render(<AgentChatClient unitName="santos" agentSlug="chat" threadId={null} />);
    expect(await screen.findByText('**bold** reply')).toBeInTheDocument();
    expect(screen.getByRole('heading')).toHaveTextContent('Santos Chat · Santos');
    expect(screen.getByTestId('other-unread')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: /Main thread/ }));
    fireEvent.click(within(screen.getByTestId('thread-switcher')).getByText('Trip plans'));
    expect(replace).toHaveBeenCalledWith(`/agents/santos/chat?thread=${T2}`);
  });

  it('honours ?thread and creates a new thread', async () => {
    route((url, init) => (url.startsWith('/api/inbox/threads?') && init?.method === 'POST'
      ? { thread: { id: T3, agentSlug: 'chat', title: 'Ideas' } } : undefined));
    route((url, init) => (url.startsWith(`/api/inbox/threads/${T3}?`) && !init?.method ? threadView(T3, { messages: [] }) : undefined));
    render(<AgentChatClient unitName="santos" agentSlug="chat" threadId={T2} />);
    expect(await screen.findByRole('button', { name: /Trip plans/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Trip plans/ }));
    fireEvent.click(screen.getByText('＋ New thread'));
    fireEvent.change(screen.getByLabelText('New thread title'), { target: { value: 'Ideas' } });
    fireEvent.click(screen.getByText('Create'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/agents/santos/chat?thread=${T3}`));
    const create = calls.find(([url, init]) => url.startsWith('/api/inbox/threads?') && init?.method === 'POST');
    expect(JSON.parse(String(create?.[1]?.body))).toMatchObject({ new: true, title: 'Ideas' });
  });

  it('renames and deletes the thread', async () => {
    route((url, init) => (init?.method === 'PATCH' ? { thread: { id: T1, title: 'Renamed' } } : undefined));
    route((url, init) => (init?.method === 'DELETE' ? { deleted: true } : undefined));
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AgentChatClient unitName="santos" agentSlug="chat" threadId={null} />);
    await screen.findByText('**bold** reply');
    fireEvent.click(screen.getByLabelText('Thread actions'));
    fireEvent.click(screen.getByText('Rename thread'));
    fireEvent.change(screen.getByLabelText('Thread title'), { target: { value: 'Renamed' } });
    fireEvent.keyDown(screen.getByLabelText('Thread title'), { key: 'Enter' });
    await waitFor(() => expect(calls.some(([, init]) => init?.method === 'PATCH')).toBe(true));
    fireEvent.click(screen.getByLabelText('Thread actions'));
    fireEvent.click(screen.getByText('Delete thread'));
    await waitFor(() => expect(calls.some(([url, init]) => init?.method === 'DELETE' && url.includes(T1))).toBe(true));
  });

  it('polls while a reply is pending, then marks it read', async () => {
    jest.useFakeTimers();
    try {
      let polls = 0;
      route((url, init) => (url.includes('/messages?') && init?.method === 'POST'
        ? { userMessage: msg('m3', 'user', 'question', 'pending'), agentMessage: null } : undefined));
      route((url, init) => {
        if (!url.startsWith(`/api/inbox/threads/${T1}?`) || init?.method) return undefined;
        polls += 1;
        return polls < 3
          ? threadView(T1, { messages: [msg('m1', 'user', 'hi'), msg('m3', 'user', 'question', 'pending')] })
          : threadView(T1, { messages: [msg('m3', 'user', 'question'), msg('m4', 'agent', 'late answer')] });
      });
      render(<AgentChatClient unitName="santos" agentSlug="chat" threadId={null} />);
      expect(await screen.findByTestId('waiting')).toHaveTextContent('waiting for Santos');
      await act(async () => { await jest.advanceTimersByTimeAsync(3100); });
      await act(async () => { await jest.advanceTimersByTimeAsync(3100); });
      expect(await screen.findByText('late answer')).toBeInTheDocument();
      await waitFor(() => expect(calls.some(([url, init]) => url.includes(`${T1}/read`) && init?.method === 'POST')).toBe(true));
    } finally {
      jest.useRealTimers();
    }
  });

  it('sends a message and retries a timed-out one', async () => {
    route(url => (url.includes('/retry') ? { userMessage: msg('m3', 'user', 'again'), agentMessage: msg('m5', 'agent', 'retried') } : undefined));
    route((url, init) => (url.includes('/messages?') && init?.method === 'POST'
      ? { userMessage: msg('m6', 'user', 'new q'), agentMessage: msg('m7', 'agent', 'fresh answer') } : undefined));
    route((url, init) => (url.startsWith(`/api/inbox/threads/${T1}?`) && !init?.method
      ? threadView(T1, { messages: [msg('m3', 'user', 'again', 'timeout', { errorCode: 'timeout' })] }) : undefined));
    render(<AgentChatClient unitName="santos" agentSlug="chat" threadId={null} />);
    fireEvent.click(await screen.findByText(/Retry/));
    await waitFor(() => expect(calls.some(([url]) => url.includes('/retry'))).toBe(true));
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'new q' } });
    fireEvent.click(screen.getByLabelText('Send'));
    await waitFor(() => expect(calls.some(([url, init]) => url.includes('/messages?') && init?.method === 'POST')).toBe(true));
  });

  it('loads older messages', async () => {
    route((url, init) => (url.startsWith(`/api/inbox/threads/${T1}?`) && !init?.method ? threadView(T1, { nextCursor: 'c1' }) : undefined));
    route(url => (url.includes('/messages?before=') ? { messages: [msg('m0', 'agent', 'ancient')], nextCursor: null } : undefined));
    render(<AgentChatClient unitName="santos" agentSlug="chat" threadId={null} />);
    fireEvent.click(await screen.findByText('Load older messages'));
    expect(await screen.findByText('ancient')).toBeInTheDocument();
  });

  it('opens a thread when the agent has none, and reports missing agents', async () => {
    route((url, init) => (url.startsWith('/api/inbox/threads?') && init?.method === 'POST' ? { thread: { id: T3, agentSlug: 'coach', title: null } } : undefined));
    route((url, init) => (url.startsWith(`/api/inbox/threads/${T3}?`) && !init?.method ? threadView(T3, { messages: [] }) : undefined));
    const { unmount } = render(<AgentChatClient unitName="barcelona" agentSlug="coach" threadId={null} />);
    expect(await screen.findByText(/Start a conversation with Coach/)).toBeInTheDocument();
    unmount();
    render(<AgentChatClient unitName="santos" agentSlug="ghost" threadId={null} />);
    expect(await screen.findByTestId('agent-missing')).toBeInTheDocument();
  });

  it('opens and closes the mobile agents drawer', async () => {
    render(<AgentChatClient unitName="santos" agentSlug="chat" threadId={null} />);
    await screen.findByText('**bold** reply');
    fireEvent.click(screen.getByLabelText('Open agents'));
    expect(screen.getByTestId('agents-drawer')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Close agents'));
    expect(screen.queryByTestId('agents-drawer')).toBeNull();
  });
});
