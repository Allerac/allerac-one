/** @jest-environment node */

import { assertDomainAccess, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { ApiKeyMissingScopeError, apiKeyService } from '@/app/services/api-keys/api-key.service';
import { GET as listConversations, POST as createConversation } from '@/app/api/v1/conversations/route';
import { GET as listMessages, POST as sendMessage } from '@/app/api/v1/conversations/[id]/messages/route';
import { ChatProviderConfigurationError } from '@/app/services/chat/chat-runtime-context';
import { executeChatMessage } from '@/app/services/chat/chat-execution.service';

var mockChatService: {
  loadConversations: jest.Mock;
  createConversation: jest.Mock;
  getConversationForUser: jest.Mock;
  loadMessages: jest.Mock;
};

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
  ApiKeyMissingScopeError: class MockApiKeyMissingScopeError extends Error {
    constructor(public readonly requiredScope: string) {
      super(`API key is missing required scope: ${requiredScope}`);
      this.name = 'ApiKeyMissingScopeError';
    }
  },
  apiKeyService: {
    validateBearerToken: jest.fn(),
  },
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({
    get: jest.fn(() => ({ value: 'en' })),
  })),
}));

jest.mock('@/app/services/database/chat.service', () => ({
  ChatService: jest.fn(() => {
    if (!mockChatService) {
      mockChatService = {
        loadConversations: jest.fn(),
        createConversation: jest.fn(),
        getConversationForUser: jest.fn(),
        loadMessages: jest.fn(),
      };
    }
    return mockChatService;
  }),
}));

jest.mock('@/app/services/chat/chat-execution.service', () => ({
  ChatConversationNotFoundError: class MockChatConversationNotFoundError extends Error {},
  ChatMessagePersistenceError: class MockChatMessagePersistenceError extends Error {},
  executeChatMessage: jest.fn(),
}));

jest.mock('@/app/services/chat/chat-runtime-context', () => ({
  ChatProviderConfigurationError: class MockChatProviderConfigurationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ChatProviderConfigurationError';
    }
  },
}));

const mockRequireCurrentUser = jest.mocked(requireCurrentUser);
const mockAssertDomainAccess = jest.mocked(assertDomainAccess);
const mockApiKeyService = jest.mocked(apiKeyService);
const mockExecuteChatMessage = jest.mocked(executeChatMessage);

const user = {
  id: 'user-id',
  email: 'user@example.com',
  name: 'User',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

const conversation = {
  id: 'conversation-id',
  user_id: user.id,
  title: 'API planning',
  domain_slug: 'chat',
  pinned: false,
  created_at: new Date('2026-06-24T00:00:00.000Z'),
  updated_at: new Date('2026-06-24T01:00:00.000Z'),
};

function jsonRequest(url: string, method: string, body: unknown, headers?: HeadersInit): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function routeParams(id = 'conversation-id') {
  return { params: Promise.resolve({ id }) };
}

describe('Control API v1 conversations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue(user);
    mockChatService.loadConversations.mockResolvedValue([]);
    mockChatService.createConversation.mockResolvedValue('conversation-id');
    mockChatService.getConversationForUser.mockResolvedValue(conversation);
    mockChatService.loadMessages.mockResolvedValue([]);
    mockAssertDomainAccess.mockResolvedValue(undefined);
    mockExecuteChatMessage.mockResolvedValue({
      conversationId: 'conversation-id',
      content: 'Hello from v1',
      events: [],
    });
  });

  it('lists conversations owned by the current user', async () => {
    mockChatService.loadConversations.mockResolvedValueOnce([conversation]);

    const response = await listConversations(new Request(
      'http://localhost/api/v1/conversations?domainSlug=chat&limit=10',
    ));

    expect(response.status).toBe(200);
    expect(mockChatService.loadConversations).toHaveBeenCalledWith(user.id, 'chat');
    expect(await response.json()).toEqual({
      data: {
        conversations: [
          {
            id: 'conversation-id',
            title: 'API planning',
            domainSlug: 'chat',
            pinned: false,
            createdAt: '2026-06-24T00:00:00.000Z',
            updatedAt: '2026-06-24T01:00:00.000Z',
          },
        ],
      },
    });
  });

  it('creates conversations for the current user', async () => {
    const response = await createConversation(jsonRequest(
      'http://localhost/api/v1/conversations',
      'POST',
      { title: 'Headless chat', domainSlug: 'tickets' },
    ));

    expect(response.status).toBe(201);
    expect(mockChatService.createConversation).toHaveBeenCalledWith(user.id, 'Headless chat', 'tickets');
    expect(mockChatService.getConversationForUser).toHaveBeenCalledWith('conversation-id', user.id);
    expect(await response.json()).toMatchObject({
      data: {
        conversation: {
          id: 'conversation-id',
          title: 'API planning',
        },
      },
    });
  });

  it('validates create conversation payloads', async () => {
    const response = await createConversation(jsonRequest(
      'http://localhost/api/v1/conversations',
      'POST',
      { title: '' },
    ));

    expect(response.status).toBe(400);
    expect(mockChatService.createConversation).not.toHaveBeenCalled();
  });

  it('lists messages only after confirming conversation ownership', async () => {
    mockChatService.loadMessages.mockResolvedValueOnce([
      {
        id: 'message-id',
        conversation_id: 'conversation-id',
        role: 'user',
        content: 'Hello',
        agent_run_id: null,
        created_at: new Date('2026-06-24T02:00:00.000Z'),
      },
    ]);

    const response = await listMessages(
      new Request('http://localhost/api/v1/conversations/conversation-id/messages'),
      routeParams(),
    );

    expect(response.status).toBe(200);
    expect(mockChatService.getConversationForUser).toHaveBeenCalledWith('conversation-id', user.id);
    expect(mockChatService.loadMessages).toHaveBeenCalledWith('conversation-id', user.id);
    expect(await response.json()).toEqual({
      data: {
        messages: [
          {
            id: 'message-id',
            conversationId: 'conversation-id',
            role: 'user',
            content: 'Hello',
            agentRunId: null,
            createdAt: '2026-06-24T02:00:00.000Z',
          },
        ],
      },
    });
  });

  it('returns not_found for missing or unowned conversations', async () => {
    mockChatService.getConversationForUser.mockResolvedValueOnce(null);

    const response = await listMessages(
      new Request('http://localhost/api/v1/conversations/missing/messages'),
      routeParams('missing'),
    );

    expect(response.status).toBe(404);
    expect(mockChatService.loadMessages).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      error: {
        code: 'not_found',
        message: 'Conversation not found',
      },
    });
  });

  it('requires chat:read scope for API key list requests', async () => {
    mockApiKeyService.validateBearerToken.mockRejectedValueOnce(
      new ApiKeyMissingScopeError('chat:read'),
    );

    const response = await listConversations(new Request('http://localhost/api/v1/conversations', {
      headers: { Authorization: 'Bearer alr_live_limited_secret' },
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'missing_scope',
        details: { requiredScope: 'chat:read' },
      },
    });
  });

  it('sends a message through the chat execution service', async () => {
    const response = await sendMessage(
      jsonRequest(
        'http://localhost/api/v1/conversations/conversation-id/messages',
        'POST',
        { message: 'Hello', model: 'gpt-4o', provider: 'github' },
      ),
      routeParams(),
    );

    expect(response.status).toBe(201);
    expect(mockChatService.getConversationForUser).toHaveBeenCalledWith('conversation-id', user.id);
    expect(mockAssertDomainAccess).toHaveBeenCalledWith(expect.objectContaining({ id: user.id }), 'chat');
    expect(mockExecuteChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conversation-id',
      domain: 'chat',
      message: 'Hello',
      modelId: 'gpt-4o',
      provider: 'github',
      locale: 'en',
    }));
    expect(await response.json()).toEqual({
      data: {
        message: {
          conversationId: 'conversation-id',
          role: 'assistant',
          content: 'Hello from v1',
        },
        events: [],
      },
    });
  });

  it('validates send message payloads', async () => {
    const response = await sendMessage(
      jsonRequest(
        'http://localhost/api/v1/conversations/conversation-id/messages',
        'POST',
        { message: '', model: 'gpt-4o', provider: 'github' },
      ),
      routeParams(),
    );

    expect(response.status).toBe(400);
    expect(mockExecuteChatMessage).not.toHaveBeenCalled();
  });

  it('returns not_found when sending to a missing conversation', async () => {
    mockChatService.getConversationForUser.mockResolvedValueOnce(null);

    const response = await sendMessage(
      jsonRequest(
        'http://localhost/api/v1/conversations/missing/messages',
        'POST',
        { message: 'Hello', model: 'gpt-4o', provider: 'github' },
      ),
      routeParams('missing'),
    );

    expect(response.status).toBe(404);
    expect(mockExecuteChatMessage).not.toHaveBeenCalled();
  });

  it('requires chat:write scope for API key send requests', async () => {
    mockApiKeyService.validateBearerToken.mockRejectedValueOnce(
      new ApiKeyMissingScopeError('chat:write'),
    );

    const response = await sendMessage(
      jsonRequest(
        'http://localhost/api/v1/conversations/conversation-id/messages',
        'POST',
        { message: 'Hello', model: 'gpt-4o', provider: 'github' },
        { Authorization: 'Bearer alr_live_limited_secret' },
      ),
      routeParams(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'missing_scope',
        details: { requiredScope: 'chat:write' },
      },
    });
  });

  it('maps missing provider configuration to 422', async () => {
    mockExecuteChatMessage.mockRejectedValueOnce(
      new ChatProviderConfigurationError('GitHub token not configured'),
    );

    const response = await sendMessage(
      jsonRequest(
        'http://localhost/api/v1/conversations/conversation-id/messages',
        'POST',
        { message: 'Hello', model: 'gpt-4o', provider: 'github' },
      ),
      routeParams(),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: {
        code: 'provider_not_configured',
        message: 'GitHub token not configured',
      },
    });
  });

  it('returns a stable 401 envelope when unauthenticated', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());

    const response = await listConversations(new Request('http://localhost/api/v1/conversations'));

    expect(response.status).toBe(401);
    expect(mockChatService.loadConversations).not.toHaveBeenCalled();
  });
});
