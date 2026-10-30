import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AgentsInboxSection from '@/app/components/inbox/AgentsInboxSection';
import FederatedThreadPanel from '@/app/components/inbox/FederatedThreadPanel';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const listing = {
  home: { name: 'napols', displayName: 'Napols', emoji: '🍕', role: 'Home', agents: [{ slug: 'chat', name: 'Chat' }, { slug: 'health', name: 'Health' }] },
  units: [{
    peerId: 'p1', name: 'santos', displayName: 'Santos', emoji: '🏖️', role: 'Beach lab', status: 'online',
    agents: [{ slug: 'chat', name: 'Santos Chat', description: null, threadId: 't1', preview: 'last reply', lastMessageAt: null, unread: 2, available: true }],
  }],
  archived: [{ peerId: 'p2', name: 'barcelona', displayName: 'Barcelona', threads: [{ threadId: 't9', agentSlug: 'chat', title: null, lastMessageAt: null }] }],
};

const thread = (overrides: Record<string, unknown> = {}) => ({
  thread: { id: 't1', agentSlug: 'chat', title: null },
  unit: { peerId: 'p1', name: 'santos', displayName: 'Santos' },
  readOnly: false,
  messages: [
    { id: 'm1', role: 'user', content: 'hi', status: 'done', truncated: false, errorCode: null, createdAt: '2026-01-01T00:00:00Z' },
    { id: 'm2', role: 'agent', content: '<img src=x onerror=alert(1)> **bold**', status: 'done', truncated: false, errorCode: null, createdAt: '2026-01-01T00:00:01Z' },
    { id: 'm3', role: 'user', content: 'again', status: 'timeout', truncated: false, errorCode: 'timeout', createdAt: '2026-01-01T00:00:02Z' },
  ],
  ...overrides,
});

// jsdom has no Response; the client only reads ok, status and json().
const fakeResponse = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const respond = (data: unknown, status = 200) => Promise.resolve(fakeResponse(status < 400 ? { data } : { error: data }, status));

describe('unified inbox UI', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    push.mockReset();
  });

  it('renders grouped units with emoji, role, unread badge and archived units', async () => {
    fetchMock.mockReturnValueOnce(respond(listing));
    render(<AgentsInboxSection isDark={false} domainId="chat" />);
    expect(await screen.findByText(/Santos · Beach lab/)).toBeInTheDocument();
    expect(screen.getByText(/Napols · Home/)).toBeInTheDocument();
    expect(screen.getByTestId('unread')).toHaveTextContent('2');
    expect(screen.getByText('last reply')).toBeInTheDocument();
    expect(screen.getByLabelText('online')).toBeInTheDocument();
    expect(screen.getByText(/Barcelona \(unpaired\)/)).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/inbox/agents?domain=chat');

    fireEvent.click(screen.getByText('Health'));
    expect(push).toHaveBeenCalledWith('/health');
  });

  it('opens a remote thread', async () => {
    fetchMock.mockReturnValueOnce(respond(listing)).mockReturnValueOnce(respond(thread()));
    render(<AgentsInboxSection isDark={false} domainId="chat" />);
    fireEvent.click(await screen.findByText('Santos Chat'));
    expect(await screen.findByText('chat @ Santos')).toBeInTheDocument();
    expect(screen.getByText('remote')).toBeInTheDocument();
  });

  it('renders remote replies as plain text and offers retry on timeout', async () => {
    fetchMock.mockReturnValueOnce(respond(thread()));
    const { container } = render(<FederatedThreadPanel isDark={false} domainId="chat" threadId="t1" onClose={() => undefined} />);
    expect(await screen.findByText('<img src=x onerror=alert(1)> **bold**')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('strong')).toBeNull();
    expect(screen.getByText(/did not answer within 60s/)).toBeInTheDocument();

    fetchMock.mockReturnValueOnce(respond({
      userMessage: { ...thread().messages[2], status: 'done', errorCode: null },
      agentMessage: { id: 'm4', role: 'agent', content: 'sorry, here', status: 'done', truncated: false, errorCode: null, createdAt: '2026-01-01T00:00:03Z' },
    }));
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('sorry, here')).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toBe('/api/inbox/threads/t1/messages/m3/retry?domain=chat');
  });

  it('shows a thinking bubble while sending', async () => {
    fetchMock.mockReturnValueOnce(respond(thread({ messages: [] })));
    render(<FederatedThreadPanel isDark={false} domainId="chat" threadId="t1" onClose={() => undefined} />);
    const input = await screen.findByLabelText('Message');
    let resolveSend: (value: unknown) => void = () => undefined;
    fetchMock.mockReturnValueOnce(new Promise(resolve => { resolveSend = resolve; }));
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByText('Send'));
    expect(await screen.findByTestId('thinking')).toBeInTheDocument();
    expect(screen.getByTestId('msg-pending')).toHaveTextContent('hello');
    resolveSend(fakeResponse({ data: {
      userMessage: { id: 'u1', role: 'user', content: 'hello', status: 'done', truncated: false, errorCode: null, createdAt: '2026-01-01T00:00:00Z' },
      agentMessage: { id: 'a1', role: 'agent', content: 'hey', status: 'done', truncated: false, errorCode: null, createdAt: '2026-01-01T00:00:01Z' },
    } }));
    expect(await screen.findByText('hey')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('thinking')).toBeNull());
  });

  it('is read-only for unpaired units', async () => {
    fetchMock.mockReturnValueOnce(respond(thread({ readOnly: true })));
    render(<FederatedThreadPanel isDark={false} domainId="chat" threadId="t9" onClose={() => undefined} />);
    expect(await screen.findByText(/Unit no longer paired/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Message')).toBeNull();
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('deletes archived history after confirmation', async () => {
    fetchMock.mockReturnValueOnce(respond(listing)).mockReturnValueOnce(respond({ deleted: 1 }))
      .mockReturnValueOnce(respond({ ...listing, archived: [] }));
    jest.spyOn(window, 'confirm').mockReturnValueOnce(true);
    render(<AgentsInboxSection isDark={false} domainId="chat" />);
    fireEvent.click(await screen.findByText('Delete history'));
    await waitFor(() => expect(screen.queryByText(/Barcelona/)).toBeNull());
    expect(fetchMock.mock.calls[1][0]).toBe('/api/inbox/peers/p2/history?domain=chat');
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
  });
});
