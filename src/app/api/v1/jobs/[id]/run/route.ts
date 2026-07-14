import { scheduledJobsService } from '@/app/services/scheduled-jobs/scheduled-jobs.service';
import { requireApiUser } from '../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../_lib/responses';
import { executionDto } from '../../../_lib/jobs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const user = await requireApiUser('jobs:write', request);
    const { id } = await params;

    const execution = await scheduledJobsService.runJobNow(id, user.id);
    if (!execution) {
      return apiError('not_found', 'Job not found', 404);
    }

    return apiData({ execution: executionDto(execution) }, { status: 201 });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/jobs/:id/run failed', error);
  }
}
