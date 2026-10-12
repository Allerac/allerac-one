import { z } from 'zod';
import { POST as runBenchmark } from '@/app/api/benchmark/route';
import { requireApiUser } from '@/app/api/v1/_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '@/app/api/v1/_lib/responses';
import { clearBenchmarkRuns, listBenchmarkRuns } from '@/app/services/benchmark/benchmark-query.service';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(5),
});

export const POST = runBenchmark;

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('benchmark:read', request);
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({ limit: url.searchParams.get('limit') ?? undefined });
    if (!parsed.success) return apiError('validation_error', 'Invalid benchmark query', 400, parsed.error.flatten());
    return apiData({ runs: await listBenchmarkRuns(user.id, parsed.data.limit) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/benchmark/runs failed', error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('benchmark:write', request);
    return apiData({ deletedRows: await clearBenchmarkRuns(user.id) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('DELETE /api/v1/benchmark/runs failed', error);
  }
}
