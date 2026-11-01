/** @jest-environment node */
import { buildFederationTools } from '@/app/tools/federation.tool';
import { FederationError } from '@/federation/errors';
import { InMemoryToolConversationStore } from '@/federation/tool-conversations';

const peer = { id: 'peer-1', unitName: 'santos', displayName: 'Santos' };

function setup() {
  const client = {
    listActivePeers: jest.fn().mockResolvedValue([]),
    listAgentsWithUnit: jest.fn(),
    findActivePeer: jest.fn().mockResolvedValue(peer),
    askAgentInConversation: jest.fn().mockResolvedValue({ answer: 'ok', truncated: false, conversationId: 'remote-1', messageId: null }),
  };
  const conversations = new InMemoryToolConversationStore();
  return { client, conversations };
}

describe('ask_peer_agent remote conversations (P4c)', () => {
  it('maps each local chat to its own remote conversation and reuses it', async () => {
    const { client, conversations } = setup();
    const tools = buildFederationTools(client as never, 'user-1', { conversationId: 'local-a', conversations });
    expect(await tools.askPeerAgent({ peer: 'santos', agent: 'Chat', question: ' first ' })).toMatchObject({ answer: 'ok' });
    await tools.askPeerAgent({ peer: 'santos', agent: 'chat', question: 'second' });
    const inputs = client.askAgentInConversation.mock.calls.map(call => call[2]);
    expect(inputs[0]).toMatchObject({ question: 'first', conversationId: null });
    expect(inputs[1]).toMatchObject({ question: 'second', conversationId: 'remote-1' });
    expect(inputs[0].idempotencyKey).toMatch(/^tool:/);
    expect(inputs[0].idempotencyKey).not.toBe(inputs[1].idempotencyKey);

    const other = buildFederationTools(client as never, 'user-1', { conversationId: 'local-b', conversations });
    await other.askPeerAgent({ peer: 'santos', agent: 'chat', question: 'elsewhere' });
    expect(client.askAgentInConversation.mock.calls[2][2]).toMatchObject({ conversationId: null });
  });

  it('starts over when the peer no longer knows the conversation', async () => {
    const { client, conversations } = setup();
    await conversations.set('local-a', 'peer-1', 'chat', 'stale');
    client.askAgentInConversation
      .mockRejectedValueOnce(new FederationError('peer_conversation_not_found', 'gone', 502))
      .mockResolvedValueOnce({ answer: 'fresh', truncated: false, conversationId: 'remote-2', messageId: null });
    const tools = buildFederationTools(client as never, 'user-1', { conversationId: 'local-a', conversations });
    expect(await tools.askPeerAgent({ peer: 'santos', agent: 'chat', question: 'q' })).toMatchObject({ answer: 'fresh' });
    expect(await conversations.get('local-a', 'peer-1', 'chat')).toBe('remote-2');
  });

  it('uses a fresh remote conversation per call without a local chat, never the shared one', async () => {
    const { client } = setup();
    const tools = buildFederationTools(client as never, 'user-1');
    await tools.askPeerAgent({ peer: 'santos', agent: 'chat', question: 'q' });
    expect(client.askAgentInConversation.mock.calls[0][2]).toMatchObject({ conversationId: null });
  });

  it('does not store a handle from an older peer', async () => {
    const { client, conversations } = setup();
    client.askAgentInConversation.mockResolvedValue({ answer: 'ok', truncated: false, conversationId: null, messageId: null });
    const tools = buildFederationTools(client as never, 'user-1', { conversationId: 'local-a', conversations });
    await tools.askPeerAgent({ peer: 'santos', agent: 'chat', question: 'q' });
    expect(conversations.rows.size).toBe(0);
  });
});
