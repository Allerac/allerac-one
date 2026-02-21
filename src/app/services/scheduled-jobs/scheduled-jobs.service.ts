import pool from '@/app/clients/db';
import type { ScheduledJob, JobExecution } from '@/app/types';

interface DBScheduledJob {
  id: string;
  user_id: string;
  name: string;
  cron_expr: string;
  prompt: string;
  channels: string[];
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
  async getScheduledJobs(userId: string): Promise<ScheduledJob[]> {
    const result = await pool.query<DBScheduledJob>(
      `SELECT * FROM scheduled_jobs WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows.map(mapJob);
  }

  async createScheduledJob(
    userId: string,
    data: { name: string; cronExpr: string; prompt: string; channels: string[]; enabled: boolean }
  ): Promise<ScheduledJob> {
    const result = await pool.query<DBScheduledJob>(
      `INSERT INTO scheduled_jobs (user_id, name, cron_expr, prompt, channels, enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, data.name, data.cronExpr, data.prompt, data.channels, data.enabled]
    );
    return mapJob(result.rows[0]);
  }

  async updateScheduledJob(
    jobId: string,
    userId: string,
    data: { name?: string; cronExpr?: string; prompt?: string; channels?: string[]; enabled?: boolean }
  ): Promise<ScheduledJob | null> {
    const result = await pool.query<DBScheduledJob>(
      `UPDATE scheduled_jobs
       SET name       = COALESCE($3, name),
           cron_expr  = COALESCE($4, cron_expr),
           prompt     = COALESCE($5, prompt),
           channels   = COALESCE($6, channels),
           enabled    = COALESCE($7, enabled)
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

  async getJobExecutions(jobId: string, limit = 5): Promise<JobExecution[]> {
    const result = await pool.query<DBJobExecution>(
      `SELECT * FROM job_executions WHERE job_id = $1 ORDER BY started_at DESC LIMIT $2`,
      [jobId, limit]
    );
    return result.rows.map(mapExecution);
  }
}

export const scheduledJobsService = new ScheduledJobsService();
