import { scheduledJobsService } from '@/app/services/scheduled-jobs/scheduled-jobs.service';
import { validateCronExpression } from '@/app/services/scheduled-jobs/cron-validation';
export { JOBS_TOOL_DEFINITIONS, SCHEDULE_TASK_TOOL_DEFINITION } from './jobs.tool.definitions';

export function buildJobsTools(userId: string, callerDomain: string = 'jobs') {
  return {
    schedule_task: async (args: { cron: string; prompt: string }) => {
      const cronExpr = args.cron?.trim();
      const prompt = args.prompt?.trim();
      if (!prompt) return { success: false, error: 'Prompt is required' };
      const cronError = validateCronExpression(cronExpr || '');
      if (cronError) return { success: false, error: cronError };
      const job = await scheduledJobsService.createScheduledJob(userId, {
        name: prompt.length > 60 ? `${prompt.slice(0, 57)}...` : prompt,
        prompt,
        cronExpr,
        channels: ['telegram'],
        enabled: true,
        domainSlug: callerDomain,
      });
      return {
        success: true,
        job_id: job.id,
        name: job.name,
        cron_expr: job.cronExpr,
        domain_slug: job.domainSlug,
      };
    },

    list_jobs: async () => {
      const jobs = await scheduledJobsService.getScheduledJobs(userId);
      return {
        jobs: jobs.map(j => ({
          job_id: j.id,
          name: j.name,
          prompt: j.prompt,
          cron_expr: j.cronExpr,
          channels: j.channels,
          enabled: j.enabled,
          last_run_at: j.lastRunAt ?? null,
        })),
      };
    },

    create_job: async (args: { name: string; prompt: string; cron_expr: string; channels?: string[]; enabled?: boolean }) => {
      const job = await scheduledJobsService.createScheduledJob(userId, {
        name: args.name,
        prompt: args.prompt,
        cronExpr: args.cron_expr,
        channels: args.channels ?? ['telegram'],
        enabled: args.enabled ?? true,
        domainSlug: 'jobs',
      });
      return { success: true, job_id: job.id, name: job.name, cron_expr: job.cronExpr };
    },

    update_job: async (args: { job_id: string; name?: string; prompt?: string; cron_expr?: string; channels?: string[]; enabled?: boolean }) => {
      const updated = await scheduledJobsService.updateScheduledJob(args.job_id, userId, {
        ...(args.name !== undefined && { name: args.name }),
        ...(args.prompt !== undefined && { prompt: args.prompt }),
        ...(args.cron_expr !== undefined && { cronExpr: args.cron_expr }),
        ...(args.channels !== undefined && { channels: args.channels }),
        ...(args.enabled !== undefined && { enabled: args.enabled }),
      });
      return { success: !!updated, job_id: updated?.id };
    },

    delete_job: async (args: { job_id: string }) => {
      const deleted = await scheduledJobsService.deleteScheduledJob(args.job_id, userId);
      return { success: deleted };
    },

    toggle_job: async (args: { job_id: string; enabled: boolean }) => {
      const updated = await scheduledJobsService.toggleJobEnabled(args.job_id, userId);
      return { success: !!updated, enabled: updated?.enabled };
    },
  };
}
