/** @jest-environment node */

import pool from '@/app/clients/db';
import {
  requireCurrentAdmin,
  requireCurrentUser,
  UnauthorizedError,
  ForbiddenError,
} from '@/app/lib/auth-session';
import { submitLog } from '@/lib/submit-log';
import { GET as getDomains } from '@/app/api/domains/route';
import { POST as submitApiLog } from '@/app/api/log-submit/route';
import { GET as streamLogs } from '@/app/api/logs/route';
import { POST as proxyOllamaChat } from '@/app/api/ollama/api/chat/route';
import { POST as pullModel } from '@/app/api/ollama/pull/route';
import {
  acquireOperationLimit,
  resetOperationLimitsForTests,
} from '@/app/lib/operation-limiter';

jest.mock('@/app/clients/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

jest.mock('@/app/lib/auth-session', () => {
  class MockUnauthorizedError extends Error {}
  class MockForbiddenError extends Error {}
  return {
    UnauthorizedError: MockUnauthorizedError,
    ForbiddenError: MockForbiddenError,
    authenticationErrorResponse: (error: unknown, options: { format?: 'text' } = {}) => {
      const status = error instanceof MockUnauthorizedError
        ? 401
        : error instanceof MockForbiddenError
          ? 403
          : null;
      if (!status) return null;
      const message = status === 401 ? 'Unauthorized' : 'Forbidden';
      return options.format === 'text'
        ? new Response(message, { status })
        : Response.json({ error: message }, { status });
    },
    requireCurrentAdmin: jest.fn(),
    requireCurrentUser: jest.fn(),
  };
});

jest.mock('@/lib/submit-log', () => ({
  submitLog: jest.fn(),
}));

const mockQuery = jest.mocked(pool.query);
const mockRequireCurrentAdmin = jest.mocked(requireCurrentAdmin);
const mockRequireCurrentUser = jest.mocked(requireCurrentUser);
const mockSubmitLog = jest.mocked(submitLog);

const admin = {
  id: 'admin-id',
  email: 'admin@example.com',
  name: 'Admin',
  is_admin: true,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

const user = {
  ...admin,
  id: 'user-id',
  email: 'user@example.com',
  name: 'User',
  is_admin: false,
};

function jsonRequest(url: string, body: unknown, headers: HeadersInit = {}): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('security-sensitive API routes', () => {
  const originalExecutorSecret = process.env.EXECUTOR_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    resetOperationLimitsForTests();
    process.env.EXECUTOR_SECRET = 'service-secret';
    mockRequireCurrentAdmin.mockResolvedValue(admin);
    mockRequireCurrentUser.mockResolvedValue(user);
  });

  afterAll(() => {
    resetOperationLimitsForTests();
    if (originalExecutorSecret === undefined) {
      delete process.env.EXECUTOR_SECRET;
    } else {
      process.env.EXECUTOR_SECRET = originalExecutorSecret;
    }
  });

  it('rejects domain discovery before querying the database', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());

    const response = await getDomains();

    expect(response.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('only returns assigned domains for non-admin users', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ slug: 'chat' }],
      rowCount: 1,
    } as never);

    const response = await getDomains();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ visible: ['chat'] });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('user_domain_access'),
      [user.id]
    );
  });

  it('does not accept log submission without a session or service secret', async () => {
    mockRequireCurrentAdmin.mockRejectedValueOnce(new UnauthorizedError());

    const response = await submitApiLog(jsonRequest(
      'http://localhost/api/log-submit',
      { context: 'Test', message: 'message' }
    ));

    expect(response.status).toBe(401);
    expect(mockSubmitLog).not.toHaveBeenCalled();
  });

  it('does not accept log submission from a non-admin session', async () => {
    mockRequireCurrentAdmin.mockRejectedValueOnce(new ForbiddenError());

    const response = await submitApiLog(jsonRequest(
      'http://localhost/api/log-submit',
      { context: 'Auth', message: 'spoofed line' }
    ));

    expect(response.status).toBe(403);
    expect(mockSubmitLog).not.toHaveBeenCalled();
  });

  it('accepts an authenticated internal log submission', async () => {
    const response = await submitApiLog(jsonRequest(
      'http://localhost/api/log-submit',
      { context: 'Executor', message: 'message', level: 'info' },
      { Authorization: 'Bearer service-secret' }
    ));

    expect(response.status).toBe(200);
    expect(mockRequireCurrentAdmin).not.toHaveBeenCalled();
    expect(mockSubmitLog).toHaveBeenCalledWith('Executor', 'message', 'info');
  });

  it('requires admin access to stream system logs', async () => {
    mockRequireCurrentAdmin.mockRejectedValueOnce(new ForbiddenError());

    const response = await streamLogs(new Request('http://localhost/api/logs'));

    expect(response.status).toBe(403);
  });

  it('returns a centralized 403 for non-admin model downloads', async () => {
    mockRequireCurrentAdmin.mockRejectedValueOnce(new ForbiddenError());

    const response = await pullModel(jsonRequest(
      'http://localhost/api/ollama/pull',
      { modelId: 'qwen2.5:3b' }
    ) as never);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });

  it('requires admin access before reading an Ollama pull request', async () => {
    mockRequireCurrentAdmin.mockRejectedValueOnce(new UnauthorizedError());
    const request = jsonRequest(
      'http://localhost/api/ollama/pull',
      { modelId: 'qwen2.5:3b' }
    );
    const jsonSpy = jest.spyOn(request, 'json');

    const response = await pullModel(request as never);

    expect(response.status).toBe(401);
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('rejects malformed Ollama model IDs before making a network request', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    const response = await pullModel(jsonRequest(
      'http://localhost/api/ollama/pull',
      { modelId: '../../etc/passwd' }
    ) as never);

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('limits model downloads globally before starting another network request', async () => {
    const activeDownload = acquireOperationLimit('model-download', 'other-admin');
    if (!activeDownload.allowed) throw new Error('Expected active download lease');
    const fetchSpy = jest.spyOn(global, 'fetch');

    const response = await pullModel(jsonRequest(
      'http://localhost/api/ollama/pull',
      { modelId: 'qwen2.5:3b' }
    ) as never);

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('5');
    expect(fetchSpy).not.toHaveBeenCalled();

    activeDownload.lease.release();
    fetchSpy.mockRestore();
  });

  it('requires a session before reading an Ollama proxy request', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());
    const request = jsonRequest(
      'http://localhost/api/ollama/api/chat',
      { model: 'qwen2.5:3b', messages: [{ role: 'user', content: 'hello' }] }
    );
    const textSpy = jest.spyOn(request, 'text');

    const response = await proxyOllamaChat(request as never);

    expect(response.status).toBe(401);
    expect(textSpy).not.toHaveBeenCalled();
  });
});
