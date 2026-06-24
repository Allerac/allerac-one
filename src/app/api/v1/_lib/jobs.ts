import type { ScheduledJob, JobExecution } from '@/app/types';

export function jobDto(job: ScheduledJob & { domainSlug?: string | null }) {
  return {
    id: job.id,
    name: job.name,
    cronExpr: job.cronExpr,
    prompt: job.prompt,
    channels: job.channels,
    domainSlug: job.domainSlug ?? null,
    enabled: job.enabled,
    lastRunAt: job.lastRunAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export function executionDto(e: JobExecution) {
  return {
    id: e.id,
    jobId: e.jobId,
    status: e.status,
    result: e.result,
    startedAt: e.startedAt,
    completedAt: e.completedAt,
  };
}
