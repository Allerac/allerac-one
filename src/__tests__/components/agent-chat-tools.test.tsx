import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AgentChatTools from '@/app/components/chat/AgentChatTools';

jest.mock('@/app/actions/chat', () => ({
  searchChatHistory: jest.fn(),
  loadArchivedConversations: jest.fn(),
}));
import * as chatActions from '@/app/actions/chat';

const hit = {
  conversationId: 'c1', conversationTitle: 'Chat', isPrimary: true, messageId: 'm1',
  snippet: 'the zanzibar ferry', createdAt: '2026-01-01T00:00:00.000Z', source: 'message' as const, score: 1,
};

describe('AgentChatTools', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows only icons until the search popover is opened, then focuses the input', () => {
    render(<AgentChatTools isDarkMode={false} onJump={jest.fn()} onOpenArchived={jest.fn()} />);
    expect(screen.queryByLabelText('Search query')).toBeNull();
    fireEvent.click(screen.getByLabelText('Search your chat history'));
    expect(screen.getByLabelText('Search query')).toHaveFocus();
  });

  it('closes on Escape and on a click outside', () => {
    render(<div><p>outside</p><AgentChatTools isDarkMode onJump={jest.fn()} onOpenArchived={jest.fn()} /></div>);
    fireEvent.click(screen.getByLabelText('Search your chat history'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByLabelText('Search query')).toBeNull();
    fireEvent.click(screen.getByLabelText('Search your chat history'));
    fireEvent.pointerDown(screen.getByText('outside'));
    expect(screen.queryByLabelText('Search query')).toBeNull();
  });

  it('searches and jumps to a result, closing the popover', async () => {
    jest.mocked(chatActions.searchChatHistory).mockResolvedValue([hit]);
    const onJump = jest.fn();
    render(<AgentChatTools isDarkMode={false} onJump={onJump} onOpenArchived={jest.fn()} />);
    fireEvent.click(screen.getByLabelText('Search your chat history'));
    fireEvent.change(screen.getByLabelText('Search query'), { target: { value: 'zanzibar' } });
    const result = await screen.findByText('the zanzibar ferry', {}, { timeout: 2000 });
    fireEvent.click(result);
    expect(onJump).toHaveBeenCalledWith(hit);
    expect(screen.queryByLabelText('Search query')).toBeNull();
  });

  it('keeps the archive reachable from its own icon', async () => {
    jest.mocked(chatActions.loadArchivedConversations).mockResolvedValue([
      { id: 'a1', title: 'Old trip', domain_slug: 'chat', updated_at: '2026-01-01T00:00:00.000Z', message_count: 3 },
    ]);
    const onOpenArchived = jest.fn();
    render(<AgentChatTools isDarkMode={false} onJump={jest.fn()} onOpenArchived={onOpenArchived} />);
    await act(async () => { fireEvent.click(screen.getByLabelText('Open archive')); });
    fireEvent.click(await screen.findByText('Old trip'));
    await waitFor(() => expect(onOpenArchived).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' })));
  });
});
