/** @jest-environment node */

import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { ApiKeyMissingScopeError, apiKeyService } from '@/app/services/api-keys/api-key.service';
import { GET as listMemories } from '@/app/api/v1/memories/route';
import { DELETE as deleteMemory } from '@/app/api/v1/memories/[id]/route';
import { POST as createConversationMemory } from '@/app/api/v1/conversations/[id]/memory/route';

var mockChatService: {
  getConversationForUser: jest.Mock;
};

var mockMemoryService: {
  getRecentSummaries: jest.Mock;
  generateConversationSummary: jest.Mock;
  deleteSummary: jest.Mock;
};

var mockSystemSettingsService: {
  loadAll: jest.Mock;
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

jest.mock('@/app/services/database/chat.service', () => ({
  ChatService: jest.fn(() => {
    if (!mockChatService) {
      mockChatService = {
        getConversationForUser: jest.fn(),
      };
    }
    return mockChatService;
  }),
}));

jest.mock('@/app/services/memory/conversation-memory.service', () => ({
  ConversationMemoryService: jest.fn(() => {
    if (!mockMemoryService) {
      mockMemoryService = {
        getRecentSummaries: jest.fn(),
        generateConversationSummary: jest.fn(),
        deleteSummary: jest.fn(),
      };
    }
    return mockMemoryService;
  }),
}));

jest.mock('@/app/services/system/system-settings.service', () => ({
  SystemSettingsService: jest.fn(() => {
    if (!mockSystemSettingsService) {
      mockSystemSettingsService = {
        loadAll: jest.fn(),
      };
    }
    return mockSystemSettingsService;
  }),
}));

const mockRequireCurrentUser = jest.mocked(requireCurrentUser);
const mockApiKeyService = jest.mocked(apiKeyService);

const user = {
  id: 'user-id',
  email: 'user@example.com',
  name: 'User',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

const memory = {
  id: 'memory-id',
  conversation_id: 'conversation-id',
  user_id: user.id,
  summary: 'User wants a clean Control API memory boundary.',
  key_topics: ['control-api', 'memory'],
  importance_score: 7,
  message_count: 4,
  domain_slug: 'chat',
  emotion: 'focused',
  created_at: '2026-06-24T12:00:00.000Z',
};

function routeParams(id = 'conversation-id') {
  return { params: Promise.resolve({ id }) };
}

describe('Control API v1 memories', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChatService ||= {
      getConversationForUser: jest.fn(),
    };
    mockMemoryService ||= {
      getRecentSummaries: jest.fn(),
      generateConversationSummary: jest.fn(),
      deleteSummary: jest.fn(),
    };
    mockSystemSettingsService ||= {
      loadAll: jest.fn(),
    };
    mockRequireCurrentUser.mockResolvedValue(user);
    mockSystemSettingsService.loadAll.mockResolvedValue({
      github_token: 'github-token',
      github_repo_token: null,
      tavily_api_key: null,
      anthropic_api_key: null,
      google_api_key: null,
      resend_api_key: null,
      resend_from_email: null,
    });
    mockChatService.getConversationForUser.mockResolvedValue({
      id: 'conversation-id',
      user_id: user.id,
      domain_slug: 'chat',
    });
    mockMemoryService.getRecentSummaries.mockResolvedValue([memory]);
    mockMemoryService.generateConversationSummary.mockResolvedValue(memory);
    mockMemoryService.deleteSummary.mockResolvedValue(undefined);
  });

  it('creates memory from an owned conversation', async () => {
    const response = await createConversationMemory(
      new Request('http://localhost/api/v1/conversations/conversation-id/memory', { method: 'POST' }),
      routeParams(),
    );

    expect(response.status).toBe(201);
    expect(mockChatService.getConversationForUser).toHaveBeenCalledWith('conversation-id', user.id);
    expect(mockMemoryService.generateConversationSummary).toHaveBeenCalledWith('conversation-id', user.id);
    expect(await response.json()).toEqual({
      data: {
        memory: {
          id: 'memory-id',
          conversationId: 'conversation-id',
          userId: user.id,
          summary: 'User wants a clean Control API memory boundary.',
          keyTopics: ['control-api', 'memory'],
          importanceScore: 7,
          messageCount: 4,
          domainSlug: 'chat',
          emotion: 'focused',
          createdAt: '2026-06-24T12:00:00.000Z',
        },
      },
    });
  });

  it('returns not_found for unowned conversations', async () => {
    mockChatService.getConversationForUser.mockResolvedValueOnce(null);

    const response = await createConversationMemory(
      new Request('http://localhost/api/v1/conversations/missing/memory', { method: 'POST' }),
      routeParams('missing'),
    );

    expect(response.status).toBe(404);
    expect(mockMemoryService.generateConversationSummary).not.toHaveBeenCalled();
  });

  it('returns provider_not_configured when creating memory without an LLM provider', async () => {
    mockSystemSettingsService.loadAll.mockResolvedValueOnce({
      github_token: null,
      github_repo_token: null,
      tavily_api_key: null,
      anthropic_api_key: null,
      google_api_key: null,
      resend_api_key: null,
      resend_from_email: null,
    });

    const response = await createConversationMemory(
      new Request('http://localhost/api/v1/conversations/conversation-id/memory', { method: 'POST' }),
      routeParams(),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: {
        code: 'provider_not_configured',
        message: 'No memory LLM provider is configured.',
      },
    });
    expect(mockMemoryService.generateConversationSummary).not.toHaveBeenCalled();
  });

  it('lists recent memories for the current user', async () => {
    const response = await listMemories(new Request(
      'http://localhost/api/v1/memories?domainSlug=chat&limit=10&minImportance=5',
    ));

    expect(response.status).toBe(200);
    expect(mockMemoryService.getRecentSummaries).toHaveBeenCalledWith(user.id, 10, 5);
    expect(await response.json()).toMatchObject({
      data: {
        memories: [{ id: 'memory-id', conversationId: 'conversation-id' }],
      },
    });
  });

  it('deletes memories owned by the current user', async () => {
    const response = await deleteMemory(
      new Request('http://localhost/api/v1/memories/memory-id', { method: 'DELETE' }),
      routeParams('memory-id'),
    );

    expect(response.status).toBe(200);
    expect(mockMemoryService.deleteSummary).toHaveBeenCalledWith('memory-id', user.id);
    expect(await response.json()).toEqual({ data: { deleted: true } });
  });

  it('requires memory:read scope for API key list requests', async () => {
    mockApiKeyService.validateBearerToken.mockRejectedValueOnce(
      new ApiKeyMissingScopeError('memory:read'),
    );

    const response = await listMemories(new Request('http://localhost/api/v1/memories', {
      headers: { Authorization: 'Bearer alr_live_limited_secret' },
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'missing_scope',
        details: { requiredScope: 'memory:read' },
      },
    });
  });

  it('returns a stable 401 envelope when unauthenticated', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());

    const response = await listMemories(new Request('http://localhost/api/v1/memories'));

    expect(response.status).toBe(401);
    expect(mockMemoryService.getRecentSummaries).not.toHaveBeenCalled();
  });
});
