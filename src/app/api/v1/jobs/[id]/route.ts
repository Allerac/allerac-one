import { z } from 'zod';
import { scheduledJobsService } from '@/app/services/scheduled-jobs/scheduled-jobs.service';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import { jobDto } from '../../_lib/jobs';
import { validateJobModelSelection } from '@/app/services/scheduled-jobs/job-model';

const CRON_REGEX = /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/;

const updateJobSchema = z.object({
  name: z.string().trim().min(1).optional(),
  cronExpr: z.string().trim().regex(CRON_REGEX, 'Invalid cron expression').optional(),
  prompt: z.string().trim().min(1).optional(),
  channels: z.array(z.string()).min(1).optional(),
  enabled: z.boolean().optional(),
  llmModel: z.string().trim().min(1).nullable().optional(),
  llmProvider: z.enum(['github', 'ollama', 'gemini', 'anthropic']).nullable().optional(),
}).superRefine((data, context) => {
  if (data.llmModel === undefined && data.llmProvider === undefined) return;
  const error = validateJobModelSelection(data.llmModel, data.llmProvider);
  if (error) context.addIssue({ code: 'custom', message: error });
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const user = await requireApiUser('jobs:write', request);
    const { id } = await params;
    const parsed = updateJobSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid job update payload', 400, parsed.error.flatten());
    }

    const job = await scheduledJobsService.updateScheduledJob(id, user.id, parsed.data);
    if (!job) return apiError('not_found', 'Job not found', 404);

    return apiData({ job: jobDto(job) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('PATCH /api/v1/jobs/:id failed', error);
  }
}

export async function DELETE(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const user = await requireApiUser('jobs:write', request);
    const { id } = await params;

    const deleted = await scheduledJobsService.deleteScheduledJob(id, user.id);
    if (!deleted) return apiError('not_found', 'Job not found', 404);

    return apiData({ deleted: true });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('DELETE /api/v1/jobs/:id failed', error);
  }
}
