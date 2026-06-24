import { scheduledJobsService } from '@/app/services/scheduled-jobs/scheduled-jobs.service';
import { requireApiUser } from '../../../_lib/auth';
import { apiAuthError, apiData, apiInternalError } from '../../../_lib/responses';
import { executionDto } from '../../../_lib/jobs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const user = await requireApiUser('jobs:read', request);
    const { id } = await params;

    const executions = await scheduledJobsService.getJobExecutions(id, user.id);
    return apiData({ executions: executions.map(executionDto) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/jobs/:id/executions failed', error);
  }
}
