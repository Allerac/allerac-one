import { z } from 'zod';
import { assertDomainAccess } from '@/app/lib/auth-session';
import { requireApiUser } from '../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../_lib/responses';
import { createMemoryReadService, memoryDto } from '../_lib/memories';

const listQuerySchema = z.object({
  domainSlug: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  minImportance: z.coerce.number().int().min(1).max(10).optional(),
  query: z.string().trim().min(1).max(500).optional(),
});

const createMemorySchema = z.object({
  content: z.string().trim().min(1).max(10_000),
  keyTopics: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  importanceScore: z.number().int().min(1).max(10).optional(),
  emotion: z.union([z.literal(-1), z.literal(0), z.literal(1)]).nullable().optional(),
  domainSlug: z.string().trim().min(1).optional(),
}).strict();

function accessUser(user: Awaited<ReturnType<typeof requireApiUser>>) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    is_admin: user.isAdmin,
    created_at: new Date(),
  };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('memory:read', request);
    const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid memory filters', 400, parsed.error.flatten());
    }
    if (parsed.data.domainSlug) {
      await assertDomainAccess(accessUser(user), parsed.data.domainSlug);
    }

    const memoryService = createMemoryReadService(parsed.data.domainSlug);
    const memories = parsed.data.query
      ? await memoryService.searchSummaries(
          user.id,
          parsed.data.query,
          parsed.data.limit ?? 20,
          parsed.data.minImportance ?? 1,
        )
      : await memoryService.getRecentSummaries(
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

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('memory:write', request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError('validation_error', 'Invalid JSON body', 400);
    }
    const parsed = createMemorySchema.safeParse(body);
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid memory payload', 400, parsed.error.flatten());
    }

    const domainSlug = parsed.data.domainSlug ?? 'chat';
    await assertDomainAccess(accessUser(user), domainSlug);
    const memoryService = createMemoryReadService(domainSlug);
    const memory = await memoryService.createManualMemory(user.id, {
      content: parsed.data.content,
      keyTopics: parsed.data.keyTopics,
      importanceScore: parsed.data.importanceScore,
      emotion: parsed.data.emotion,
    });
    return apiData({ memory: memoryDto(memory) }, { status: 201 });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/memories failed', error);
  }
}
