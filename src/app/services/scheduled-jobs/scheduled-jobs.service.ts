import pool from '@/app/clients/db';
import type { ScheduledJob, JobExecution } from '@/app/types';
import { handleChatMessage } from '@/app/services/chat/chat-handler';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { buildSoul } from '@/app/config/allerac-soul';
import { resolveJobModel, type JobModelProvider } from './job-model';

interface DBScheduledJob {
  id: string;
  user_id: string;
  name: string;
  cron_expr: string;
  prompt: string;
  channels: string[];
  domain_slug: string | null;
  llm_model: string | null;
  llm_provider: JobModelProvider | null;
  enabled: boolean;
  last_run_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface DBJobExecution {
  id: string;
  job_id: string;
  status: 'running' | 'completed' | 'failed';
  result: string | null;
  started_at: Date;
  completed_at: Date | null;
}

function mapJob(row: DBScheduledJob): ScheduledJob {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    cronExpr: row.cron_expr,
    prompt: row.prompt,
    channels: row.channels,
    domainSlug: row.domain_slug ?? null,
    llmModel: row.llm_model ?? null,
    llmProvider: row.llm_provider ?? null,
    enabled: row.enabled,
    lastRunAt: row.last_run_at ? row.last_run_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapExecution(row: DBJobExecution): JobExecution {
  return {
    id: row.id,
    jobId: row.job_id,
    status: row.status,
    result: row.result,
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
  };
}

export class ScheduledJobsService {
  private userSettingsService = new UserSettingsService();
  private systemSettingsService = new SystemSettingsService();

  async getScheduledJobs(userId: string): Promise<ScheduledJob[]> {
    const result = await pool.query<DBScheduledJob>(
      `SELECT * FROM scheduled_jobs WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows.map(mapJob);
  }

  async createScheduledJob(
    userId: string,
    data: { name: string; cronExpr: string; prompt: string; channels: string[]; enabled: boolean; domainSlug?: string | null; llmModel?: string | null; llmProvider?: JobModelProvider | null }
  ): Promise<ScheduledJob> {
    const result = await pool.query<DBScheduledJob>(
      `INSERT INTO scheduled_jobs (user_id, name, cron_expr, prompt, channels, enabled, domain_slug, llm_model, llm_provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [userId, data.name, data.cronExpr, data.prompt, data.channels, data.enabled, data.domainSlug ?? null, data.llmModel ?? null, data.llmProvider ?? null]
    );
    return mapJob(result.rows[0]);
  }

  async updateScheduledJob(
    jobId: string,
    userId: string,
    data: { name?: string; cronExpr?: string; prompt?: string; channels?: string[]; enabled?: boolean; llmModel?: string | null; llmProvider?: JobModelProvider | null }
  ): Promise<ScheduledJob | null> {
    const result = await pool.query<DBScheduledJob>(
      `UPDATE scheduled_jobs
       SET name       = COALESCE($3, name),
           cron_expr  = COALESCE($4, cron_expr),
           prompt     = COALESCE($5, prompt),
           channels   = COALESCE($6, channels),
           enabled    = COALESCE($7, enabled),
           llm_model  = CASE WHEN $8::boolean THEN $9 ELSE llm_model END,
           llm_provider = CASE WHEN $8::boolean THEN $10 ELSE llm_provider END
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        jobId,
        userId,
        data.name ?? null,
        data.cronExpr ?? null,
        data.prompt ?? null,
        data.channels ?? null,
        data.enabled ?? null,
        data.llmModel !== undefined || data.llmProvider !== undefined,
        data.llmModel ?? null,
        data.llmProvider ?? null,
      ]
    );
    return result.rows[0] ? mapJob(result.rows[0]) : null;
  }

  async deleteScheduledJob(jobId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM scheduled_jobs WHERE id = $1 AND user_id = $2`,
      [jobId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async toggleJobEnabled(jobId: string, userId: string): Promise<ScheduledJob | null> {
    const result = await pool.query<DBScheduledJob>(
      `UPDATE scheduled_jobs
       SET enabled = NOT enabled
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [jobId, userId]
    );
    return result.rows[0] ? mapJob(result.rows[0]) : null;
  }

  async getJobExecutions(jobId: string, userId: string, limit = 5): Promise<JobExecution[]> {
    const result = await pool.query<DBJobExecution>(
      `SELECT je.*
       FROM job_executions je
       INNER JOIN scheduled_jobs sj ON sj.id = je.job_id
       WHERE je.job_id = $1 AND sj.user_id = $2
       ORDER BY je.started_at DESC
       LIMIT $3`,
      [jobId, userId, limit]
    );
    return result.rows.map(mapExecution);
  }

  async runJobNow(jobId: string, userId: string): Promise<JobExecution | null> {
    const jobResult = await pool.query<DBScheduledJob>(
      `SELECT *
       FROM scheduled_jobs
       WHERE id = $1 AND user_id = $2 AND enabled = TRUE`,
      [jobId, userId],
    );
    const job = jobResult.rows[0];
    if (!job) return null;

    const executionResult = await pool.query<DBJobExecution>(
      `INSERT INTO job_executions (job_id, status)
       VALUES ($1, 'running')
       RETURNING *`,
      [jobId],
    );
    const executionId = executionResult.rows[0].id;

    try {
      const [settings, systemSettings] = await Promise.all([
        this.userSettingsService.loadUserSettings(userId),
        this.systemSettingsService.loadAll(),
      ]);

      const githubToken = settings?.github_token || systemSettings.github_token || process.env.GITHUB_TOKEN || '';
      const tavilyApiKey = settings?.tavily_api_key || systemSettings.tavily_api_key || process.env.TAVILY_API_KEY || undefined;
      const googleApiKey = settings?.google_api_key || systemSettings.google_api_key || '';
      const anthropicApiKey = settings?.anthropic_api_key || systemSettings.anthropic_api_key || '';

      const { selectedModel, modelProvider, modelBaseUrl } = resolveJobModel(
        job.llm_model,
        job.llm_provider,
        { githubToken, googleApiKey, anthropicApiKey },
      );

      const userResult = await pool.query<{ name: string | null }>(
        'SELECT name FROM users WHERE id = $1',
        [userId],
      );
      const timezone = settings?.timezone || 'UTC';
      const now = new Date();
      const today = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now).replace(/(\d+)\/(\d+)\/(\d+),/, '$3-$1-$2');

      let systemMessage = buildSoul('jobs');
      systemMessage += `\n\n## Context\n- Current date & time: ${today} (${timezone})`;
      if (userResult.rows[0]?.name) {
        systemMessage += `\n- User: ${userResult.rows[0].name}`;
      }

      const result = await handleChatMessage(job.prompt, null, {
        userId,
        githubToken,
        geminiToken: googleApiKey || undefined,
        anthropicToken: anthropicApiKey || undefined,
        tavilyApiKey,
        selectedModel,
        modelProvider,
        modelBaseUrl,
        systemMessage,
        domainSlug: job.domain_slug ?? 'jobs',
        language: settings?.language ?? undefined,
      });

      const completed = await pool.query<DBJobExecution>(
        `UPDATE job_executions
         SET status = 'completed', result = $2, completed_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [executionId, result.response],
      );
      await pool.query(
        `UPDATE scheduled_jobs SET last_run_at = NOW() WHERE id = $1`,
        [jobId],
      );
      return mapExecution(completed.rows[0]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const failed = await pool.query<DBJobExecution>(
        `UPDATE job_executions
         SET status = 'failed', result = $2, completed_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [executionId, message],
      );
      await pool.query(
        `UPDATE scheduled_jobs SET last_run_at = NOW() WHERE id = $1`,
        [jobId],
      );
      return mapExecution(failed.rows[0]);
    }
  }
}

export const scheduledJobsService = new ScheduledJobsService();
