import { z } from 'zod';
import { scheduledJobsService } from '@/app/services/scheduled-jobs/scheduled-jobs.service';
import { requireApiUser } from '../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../_lib/responses';
import { jobDto } from '../_lib/jobs';

const CRON_REGEX = /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/;

const createJobSchema = z.object({
  name: z.string().trim().min(1),
  cronExpr: z.string().trim().regex(CRON_REGEX, 'Invalid cron expression'),
  prompt: z.string().trim().min(1),
  channels: z.array(z.string()).min(1),
  enabled: z.boolean().optional(),
  domainSlug: z.string().trim().min(1).nullable().optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('jobs:read', request);
    const jobs = await scheduledJobsService.getScheduledJobs(user.id);
    return apiData({ jobs: jobs.map(jobDto) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/jobs failed', error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('jobs:write', request);
    const parsed = createJobSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid job payload', 400, parsed.error.flatten());
    }

    const job = await scheduledJobsService.createScheduledJob(user.id, {
      name: parsed.data.name,
      cronExpr: parsed.data.cronExpr,
      prompt: parsed.data.prompt,
      channels: parsed.data.channels,
      enabled: parsed.data.enabled ?? true,
      domainSlug: parsed.data.domainSlug ?? null,
    });

    return apiData({ job: jobDto(job) }, { status: 201 });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/jobs failed', error);
  }
}
