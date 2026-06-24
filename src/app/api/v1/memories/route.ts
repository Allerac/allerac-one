import { z } from 'zod';
import { requireApiUser } from '../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../_lib/responses';
import { createMemoryReadService, memoryDto } from '../_lib/memories';

const listQuerySchema = z.object({
  domainSlug: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  minImportance: z.coerce.number().int().min(1).max(10).optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('memory:read', request);
    const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid memory filters', 400, parsed.error.flatten());
    }

    const memoryService = createMemoryReadService(parsed.data.domainSlug);
    const memories = await memoryService.getRecentSummaries(
      user.id,
      parsed.data.limit ?? 20,
      parsed.data.minImportance ?? 1,
    );

    return apiData({ memories: memories.map(memoryDto) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/memories failed', error);
  }
}
