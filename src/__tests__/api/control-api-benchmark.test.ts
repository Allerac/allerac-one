/** @jest-environment node */

import { UnauthorizedError } from '@/app/lib/auth-session';
import { requireApiUser } from '@/app/api/v1/_lib/auth';
import { GET as listRuns, POST as createRun, DELETE as clearRuns } from '@/app/api/v1/benchmark/runs/route';
import { GET as listModels } from '@/app/api/v1/benchmark/models/route';
import {
  clearBenchmarkRuns,
  getBenchmarkModelAvailability,
  listBenchmarkRuns,
} from '@/app/services/benchmark/benchmark-query.service';

jest.mock('@/app/api/v1/_lib/auth', () => ({ requireApiUser: jest.fn() }));
jest.mock('@/app/services/benchmark/benchmark-query.service', () => ({
  clearBenchmarkRuns: jest.fn(),
  getBenchmarkModelAvailability: jest.fn(),
  listBenchmarkRuns: jest.fn(),
}));

const mockRequireApiUser = jest.mocked(requireApiUser);
const mockListRuns = jest.mocked(listBenchmarkRuns);
const mockClearRuns = jest.mocked(clearBenchmarkRuns);
const mockAvailability = jest.mocked(getBenchmarkModelAvailability);

const apiUser = {
  id: 'user-a',
  email: 'user@example.com',
  name: 'User',
  isAdmin: true,
  authMode: 'api_key' as const,
};

describe('Control API v1 benchmark', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireApiUser.mockResolvedValue(apiUser);
  });

  it('requires benchmark:read to list runs', async () => {
    mockListRuns.mockResolvedValueOnce([]);
    const response = await listRuns(new Request('http://localhost/api/v1/benchmark/runs?limit=10'));
    expect(response.status).toBe(200);
    expect(mockRequireApiUser).toHaveBeenCalledWith('benchmark:read', expect.any(Request));
    expect(mockListRuns).toHaveBeenCalledWith('user-a', 10);
  });

  it('rejects an invalid history limit', async () => {
    const response = await listRuns(new Request('http://localhost/api/v1/benchmark/runs?limit=100'));
    expect(response.status).toBe(400);
    expect(mockListRuns).not.toHaveBeenCalled();
  });

  it('clears only the authenticated user history with benchmark:write', async () => {
    mockClearRuns.mockResolvedValueOnce(12);
    const response = await clearRuns(new Request('http://localhost/api/v1/benchmark/runs', { method: 'DELETE' }));
    expect(response.status).toBe(200);
    expect(mockRequireApiUser).toHaveBeenCalledWith('benchmark:write', expect.any(Request));
    expect(mockClearRuns).toHaveBeenCalledWith('user-a');
    expect(await response.json()).toEqual({ data: { deletedRows: 12 } });
  });

  it('lists model availability with benchmark:read', async () => {
    mockAvailability.mockResolvedValueOnce({
      providers: { github: true, gemini: false, anthropic: false, ollama: true },
      ollamaModels: ['qwen2.5:3b'],
    });
    const response = await listModels(new Request('http://localhost/api/v1/benchmark/models'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'qwen2.5:3b', available: true }),
      expect.objectContaining({ id: 'gemini-2.5-flash', available: false }),
    ]));
  });

  it('validates run payloads after requiring benchmark:write', async () => {
    const response = await createRun(new Request('http://localhost/api/v1/benchmark/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: '', provider: 'github' }),
    }));
    expect(response.status).toBe(400);
    expect(mockRequireApiUser).toHaveBeenCalledWith('benchmark:write', expect.any(Request));
  });

  it('returns 401 when authentication fails', async () => {
    mockRequireApiUser.mockRejectedValueOnce(new UnauthorizedError());
    const response = await listRuns(new Request('http://localhost/api/v1/benchmark/runs'));
    expect(response.status).toBe(401);
  });
});
