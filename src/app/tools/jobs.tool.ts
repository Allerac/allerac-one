import { scheduledJobsService } from '@/app/services/scheduled-jobs/scheduled-jobs.service';
export { JOBS_TOOL_DEFINITIONS } from './jobs.tool.definitions';

export function buildJobsTools(userId: string) {
  return {
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
