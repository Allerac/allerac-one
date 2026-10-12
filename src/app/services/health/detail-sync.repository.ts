import pool from '@/app/clients/db';

// Idempotent job queue for Phase 2 detail sync (docs/roadmap/
// health-detailed-activities.md). Mirrors the claim shape of
// src/app/services/agents/worker-run.repository.ts (used by agent_runs),
// but wraps the claim in an explicit transaction so multiple concurrent
// agent-worker instances can safely process this queue — the existing
// agent_runs claim relies on a single-instance assumption instead.
export interface DetailSyncJobRecord {
  id: string;
  user_id: string;
  activity_id: string;
  status: 'pending' | 'claimed' | 'running' | 'completed' | 'failed';
  attempts: number;
  last_error: string | null;
  claimed_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class DetailSyncRepository {
  async claimPendingJob(): Promise<DetailSyncJobRecord | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<DetailSyncJobRecord>(
        `SELECT * FROM health_activity_detail_sync_jobs
         WHERE status = 'pending'
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`
      );
      const job = result.rows[0];
      if (!job) {
        await client.query('COMMIT');
        return null;
      }

      await client.query(
        `UPDATE health_activity_detail_sync_jobs
         SET status = 'claimed', claimed_at = NOW(), attempts = attempts + 1, updated_at = NOW()
         WHERE id = $1`,
        [job.id]
      );
      await client.query('COMMIT');
      return { ...job, status: 'claimed', attempts: job.attempts + 1 };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Recovers jobs left stuck in 'claimed'/'running' by a crashed worker,
  // so they get picked up again — same intent as agent_runs' claimStaleRuns.
  async recoverStaleJobs(maxAgeMinutes: number): Promise<number> {
    const result = await pool.query(
      `UPDATE health_activity_detail_sync_jobs
       SET status = 'pending', updated_at = NOW()
       WHERE status IN ('claimed', 'running')
         AND updated_at < NOW() - ($1::int * interval '1 minute')`,
      [maxAgeMinutes]
    );
    return result.rowCount ?? 0;
  }

  async markRunning(jobId: string): Promise<void> {
    await pool.query(
      `UPDATE health_activity_detail_sync_jobs SET status = 'running', updated_at = NOW() WHERE id = $1`,
      [jobId]
    );
  }

  async markCompleted(jobId: string): Promise<void> {
    await pool.query(
      `UPDATE health_activity_detail_sync_jobs
       SET status = 'completed', completed_at = NOW(), last_error = NULL, updated_at = NOW()
       WHERE id = $1`,
      [jobId]
    );
  }

  async markFailed(jobId: string, errorMessage: string): Promise<void> {
    await pool.query(
      `UPDATE health_activity_detail_sync_jobs
       SET status = 'failed', last_error = $2, updated_at = NOW()
       WHERE id = $1`,
      [jobId, errorMessage.slice(0, 2000)]
    );
  }
}

export const detailSyncRepository = new DetailSyncRepository();
