import { WorkerRunRepository } from '@/app/services/agents/worker-run.repository';
import { requireApiUser } from '../../_lib/auth';
import { agentRunDto } from '../../_lib/agent-runs';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';

const repo = new WorkerRunRepository();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireApiUser('agents:read', request);
    const { id } = await context.params;

    const run = await repo.getRunForUser(id, user.id);
    if (!run) {
      return apiError('not_found', 'Agent run not found', 404);
    }

    const workers = await repo.getRunWorkersForUser(id, user.id);
    return apiData({ agentRun: agentRunDto({ ...run, workers }) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/agent-runs/:id failed', error);
  }
}
