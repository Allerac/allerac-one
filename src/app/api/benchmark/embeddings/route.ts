import { z } from 'zod';
import { requireApiUser } from '@/app/api/v1/_lib/auth';
import {
  apiAuthError,
  apiData,
  apiError,
  apiInternalError,
} from '@/app/api/v1/_lib/responses';
import {
  listEmbeddingBenchmarkModels,
  runEmbeddingBenchmark,
} from '@/app/services/benchmark/embedding-benchmark.service';
import {
  acquireOperationLimit,
  operationLimitResponse,
} from '@/app/lib/operation-limiter';

const requestSchema = z.object({
  models: z.array(z.string().min(1).max(200)).min(1).max(3),
});

export async function GET(request: Request): Promise<Response> {
  try {
    await requireApiUser('benchmark:read', request);
    return apiData({ models: await listEmbeddingBenchmarkModels() });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/benchmark/embeddings failed', error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('benchmark:write', request);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid embedding benchmark request', 400, parsed.error.flatten());
    }

    const limit = acquireOperationLimit('benchmark', user.id);
    if (!limit.allowed) return operationLimitResponse(limit);

    try {
      const startedAt = new Date();
      const results = await runEmbeddingBenchmark(parsed.data.models);
      return apiData({
        run: {
          id: crypto.randomUUID(),
          createdAt: startedAt.toISOString(),
          results,
        },
      });
    } finally {
      limit.lease.release();
    }
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/benchmark/embeddings failed', error);
  }
}
