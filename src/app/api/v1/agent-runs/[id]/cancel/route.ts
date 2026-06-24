import { WorkerRunRepository } from '@/app/services/agents/worker-run.repository';
import { requireApiUser } from '../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../_lib/responses';

const repo = new WorkerRunRepository();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireApiUser('agents:write', request);
    const { id } = await context.params;

    const cancelled = await repo.cancelRunForUser(id, user.id);
    if (!cancelled) {
      return apiError('not_found', 'Agent run not found or cannot be cancelled', 404);
    }

    return apiData({ cancelled: true });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/agent-runs/:id/cancel failed', error);
  }
}
