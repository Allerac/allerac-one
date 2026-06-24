import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiInternalError } from '../../_lib/responses';
import { createMemoryReadService } from '../../_lib/memories';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireApiUser('memory:write', request);
    const { id } = await context.params;

    const memoryService = createMemoryReadService();
    await memoryService.deleteSummary(id, user.id);

    return apiData({ deleted: true });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('DELETE /api/v1/memories/:id failed', error);
  }
}
