/** @jest-environment node */

import { requireApiUser } from '@/app/api/v1/_lib/auth';
import { GET, POST } from '@/app/api/v1/benchmark/embeddings/route';
import {
  listEmbeddingBenchmarkModels,
  runEmbeddingBenchmark,
} from '@/app/services/benchmark/embedding-benchmark.service';
import { acquireOperationLimit } from '@/app/lib/operation-limiter';

jest.mock('@/app/api/v1/_lib/auth', () => ({ requireApiUser: jest.fn() }));
jest.mock('@/app/services/benchmark/embedding-benchmark.service', () => ({
  listEmbeddingBenchmarkModels: jest.fn(),
  runEmbeddingBenchmark: jest.fn(),
}));
jest.mock('@/app/lib/operation-limiter', () => ({
  acquireOperationLimit: jest.fn(),
  operationLimitResponse: jest.fn(),
}));

const apiUser = {
  id: 'admin-a',
  email: 'admin@example.com',
  name: 'Admin',
  isAdmin: true,
  authMode: 'session' as const,
};

describe('Control API v1 embedding benchmark', () => {
  const release = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(requireApiUser).mockResolvedValue(apiUser);
    jest.mocked(acquireOperationLimit).mockReturnValue({
      allowed: true,
      headers: {},
      lease: { release },
    });
  });

  it('lists configured models and installation state', async () => {
    jest.mocked(listEmbeddingBenchmarkModels).mockResolvedValue([
      { id: 'embeddinggemma', installed: true },
    ]);

    const response = await GET(new Request('http://localhost/api/v1/benchmark/embeddings'));

    expect(response.status).toBe(200);
    expect(requireApiUser).toHaveBeenCalledWith('benchmark:read', expect.any(Request));
    expect(await response.json()).toEqual({
      data: { models: [{ id: 'embeddinggemma', installed: true }] },
    });
  });

  it('runs selected models under the benchmark operation limit', async () => {
    jest.mocked(runEmbeddingBenchmark).mockResolvedValue([
      {
        model: 'embeddinggemma',
        dimensions: 768,
        firstRequestMs: 100,
        warmMs: 50,
        retrievalCorrect: 6,
        retrievalTotal: 6,
        retrievalMs: 200,
        batchCount: 100,
        batchMs: 1000,
        batchPerItemMs: 10,
        acceptance: {
          passed: true,
          checks: {
            coldStart: true,
            warmQuery: true,
            batchThroughput: true,
            retrievalRecallAt1: true,
          },
        },
      },
    ]);

    const response = await POST(new Request('http://localhost/api/v1/benchmark/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ models: ['embeddinggemma'] }),
    }));

    expect(response.status).toBe(200);
    expect(requireApiUser).toHaveBeenCalledWith('benchmark:write', expect.any(Request));
    expect(acquireOperationLimit).toHaveBeenCalledWith('benchmark', 'admin-a');
    expect(runEmbeddingBenchmark).toHaveBeenCalledWith(['embeddinggemma']);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('rejects empty model selections before acquiring a lease', async () => {
    const response = await POST(new Request('http://localhost/api/v1/benchmark/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ models: [] }),
    }));

    expect(response.status).toBe(400);
    expect(acquireOperationLimit).not.toHaveBeenCalled();
    expect(runEmbeddingBenchmark).not.toHaveBeenCalled();
  });
});
