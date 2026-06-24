import { scheduledJobsService } from '@/app/services/scheduled-jobs/scheduled-jobs.service';
import { requireApiUser } from '../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../_lib/responses';
import { jobDto } from '../../../_lib/jobs';

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

    const job = await scheduledJobsService.toggleJobEnabled(id, user.id);
    if (!job) return apiError('not_found', 'Job not found', 404);

    return apiData({ job: jobDto(job) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/jobs/:id/toggle failed', error);
  }
}
