/** @jest-environment node */

import '../__mocks__/db';
import pool from '@/app/clients/db';
import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { ApiKeyMissingScopeError, apiKeyService } from '@/app/services/api-keys/api-key.service';
import { GET as listAgentRuns, POST as createAgentRun } from '@/app/api/v1/agent-runs/route';
import { GET as getAgentRun } from '@/app/api/v1/agent-runs/[id]/route';
import { POST as cancelAgentRun } from '@/app/api/v1/agent-runs/[id]/cancel/route';

var mockChatService: {
  createConversation: jest.Mock;
  getConversationForUser: jest.Mock;
  saveMessage: jest.Mock;
};

var mockRepo: {
  getUserRuns: jest.Mock;
  getRunForUser: jest.Mock;
  getRunWorkersForUser: jest.Mock;
  cancelRunForUser: jest.Mock;
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
        createConversation: jest.fn(),
        getConversationForUser: jest.fn(),
        saveMessage: jest.fn(),
      };
    }
    return mockChatService;
  }),
}));

jest.mock('@/app/services/agents/worker-run.repository', () => ({
  WorkerRunRepository: jest.fn(() => {
    if (!mockRepo) {
      mockRepo = {
        getUserRuns: jest.fn(),
        getRunForUser: jest.fn(),
        getRunWorkersForUser: jest.fn(),
        cancelRunForUser: jest.fn(),
      };
    }
    return mockRepo;
  }),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'run-id'),
}));

const mockQuery = (pool as any).query;
const mockRequireCurrentUser = jest.mocked(requireCurrentUser);
const mockApiKeyService = jest.mocked(apiKeyService);

const user = {
  id: 'user-id',
  email: 'user@example.com',
  name: 'User',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

const run = {
  id: 'run-id',
  conversation_id: 'conversation-id',
  user_id: user.id,
  status: 'pending',
  prompt: 'Investigate failing deploy',
  plan: null,
  result: null,
  error_message: null,
  started_at: new Date('2026-06-24T00:00:00.000Z'),
  completed_at: null,
  cancelled_at: null,
  last_heartbeat: null,
  llm_model: 'claude-haiku-4-5-20251001',
  llm_provider: 'anthropic',
  skill_id: null,
} as const;

function jsonRequest(url: string, method: string, body: unknown, headers?: HeadersInit): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function routeParams(id = 'run-id') {
  return { params: Promise.resolve({ id }) };
}

describe('Control API v1 agent runs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue(user);
    mockChatService.createConversation.mockResolvedValue('conversation-id');
    mockChatService.getConversationForUser.mockResolvedValue({ id: 'conversation-id' });
    mockChatService.saveMessage.mockResolvedValue({ success: true });
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('lists agent runs owned by the current user', async () => {
    mockRepo.getUserRuns.mockResolvedValueOnce([{ ...run, workers: [] }]);

    const response = await listAgentRuns(new Request('http://localhost/api/v1/agent-runs?limit=10'));

    expect(response.status).toBe(200);
    expect(mockRepo.getUserRuns).toHaveBeenCalledWith(user.id, 10);
    expect(await response.json()).toMatchObject({
      data: {
        agentRuns: [
          {
            id: 'run-id',
            conversationId: 'conversation-id',
            status: 'pending',
            model: 'claude-haiku-4-5-20251001',
            provider: 'anthropic',
          },
        ],
      },
    });
  });

  it('creates pending agent runs and conversation messages', async () => {
    mockRepo.getRunForUser.mockResolvedValueOnce(run);

    const response = await createAgentRun(jsonRequest(
      'http://localhost/api/v1/agent-runs',
      'POST',
      {
        message: 'Investigate failing deploy',
        model: 'claude-haiku-4-5-20251001',
        provider: 'anthropic',
      },
    ));

    expect(response.status).toBe(201);
    expect(mockChatService.createConversation).toHaveBeenCalledWith(user.id, 'Investigate failing deploy');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO agent_runs'),
      [
        'run-id',
        'conversation-id',
        user.id,
        'pending',
        'Investigate failing deploy',
        'claude-haiku-4-5-20251001',
        'anthropic',
        null,
      ],
    );
    expect(mockChatService.saveMessage).toHaveBeenCalledWith(
      'conversation-id',
      'assistant',
      '',
      { agentRunId: 'run-id', userId: user.id },
    );
    expect(await response.json()).toMatchObject({
      data: {
        agentRun: {
          id: 'run-id',
          status: 'pending',
        },
      },
    });
  });

  it('rejects create requests for conversations not owned by the user', async () => {
    mockChatService.getConversationForUser.mockResolvedValueOnce(null);

    const response = await createAgentRun(jsonRequest(
      'http://localhost/api/v1/agent-runs',
      'POST',
      {
        message: 'Run this',
        conversationId: '00000000-0000-4000-8000-000000000001',
      },
    ));

    expect(response.status).toBe(404);
    expect(mockQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO agent_runs'),
      expect.anything(),
    );
  });

  it('returns agent run details with workers', async () => {
    mockRepo.getRunForUser.mockResolvedValueOnce(run);
    mockRepo.getRunWorkersForUser.mockResolvedValueOnce([
      {
        id: 'worker-id',
        run_id: 'run-id',
        name: 'Investigator',
        task: 'Read logs',
        skill_id: null,
        status: 'completed',
        result: 'Done',
        tokens_used: 123,
        progress_log: 'Started',
        last_heartbeat: null,
        started_at: null,
        completed_at: null,
      },
    ]);

    const response = await getAgentRun(
      new Request('http://localhost/api/v1/agent-runs/run-id'),
      routeParams(),
    );

    expect(response.status).toBe(200);
    expect(mockRepo.getRunForUser).toHaveBeenCalledWith('run-id', user.id);
    expect(await response.json()).toMatchObject({
      data: {
        agentRun: {
          id: 'run-id',
          workers: [{ id: 'worker-id', status: 'completed' }],
        },
      },
    });
  });

  it('returns not_found for missing or unowned agent runs', async () => {
    mockRepo.getRunForUser.mockResolvedValueOnce(null);

    const response = await getAgentRun(
      new Request('http://localhost/api/v1/agent-runs/missing'),
      routeParams('missing'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: 'not_found',
        message: 'Agent run not found',
      },
    });
  });

  it('cancels owned agent runs', async () => {
    mockRepo.cancelRunForUser.mockResolvedValueOnce(true);

    const response = await cancelAgentRun(
      new Request('http://localhost/api/v1/agent-runs/run-id/cancel', { method: 'POST' }),
      routeParams(),
    );

    expect(response.status).toBe(200);
    expect(mockRepo.cancelRunForUser).toHaveBeenCalledWith('run-id', user.id);
    expect(await response.json()).toEqual({ data: { cancelled: true } });
  });

  it('requires agents:read scope for API key list requests', async () => {
    mockApiKeyService.validateBearerToken.mockRejectedValueOnce(
      new ApiKeyMissingScopeError('agents:read'),
    );

    const response = await listAgentRuns(new Request('http://localhost/api/v1/agent-runs', {
      headers: { Authorization: 'Bearer alr_live_limited_secret' },
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'missing_scope',
        details: { requiredScope: 'agents:read' },
      },
    });
  });

  it('returns a stable 401 envelope when unauthenticated', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());

    const response = await listAgentRuns(new Request('http://localhost/api/v1/agent-runs'));

    expect(response.status).toBe(401);
    expect(mockRepo.getUserRuns).not.toHaveBeenCalled();
  });
});
