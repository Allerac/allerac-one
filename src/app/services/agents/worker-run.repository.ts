import pool from '@/app/clients/db';

export interface AgentRunRecord {
  id: string;
  conversation_id: string;
  user_id: string;
  status: 'pending' | 'planning' | 'running' | 'aggregating' | 'completed' | 'failed';
  prompt: string;
  plan: any | null;
  result: string | null;
  error_message: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  last_heartbeat: Date | null;
  llm_model: string | null;
  llm_provider: string | null;
}

export interface AgentWorkerRecord {
  id: string;
  run_id: string;
  name: string;
  task: string;
  skill_id: string | null;
  status: 'waiting' | 'running' | 'completed' | 'failed';
  result: string | null;
  tokens_used: number | null;
  progress_log: string | null;
  last_heartbeat: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
}

export interface UserSettings {
  github_token: string | null;
  tavily_api_key: string | null;
  google_api_key: string | null;
  anthropic_api_key: string | null;
  system_message: string | null;
}

export class WorkerRunRepository {
  async claimPendingRun(): Promise<AgentRunRecord | null> {
    const result = await pool.query<AgentRunRecord>(
      `SELECT * FROM agent_runs
       WHERE status = 'pending'
       ORDER BY started_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`
    );
    return result.rows[0] || null;
  }

  async claimStaleRuns(maxAgeMinutes: number): Promise<AgentRunRecord[]> {
    const result = await pool.query<AgentRunRecord>(
      `SELECT * FROM agent_runs
       WHERE status IN ('planning', 'running', 'aggregating')
         AND last_heartbeat < NOW() - ($1::int * interval '1 minute')
       FOR UPDATE SKIP LOCKED`,
      [maxAgeMinutes]
    );
    return result.rows;
  }

  async updateRunStatus(
    runId: string,
    status: AgentRunRecord['status'],
    fields?: { plan?: any; result?: string; error_message?: string }
  ): Promise<void> {
    const updateParts = [`status = $2`, `last_heartbeat = NOW()`];
    const values: any[] = [runId, status];
    let paramIdx = 3;

    if (fields?.plan !== undefined) {
      updateParts.push(`plan = $${paramIdx}`);
      values.push(JSON.stringify(fields.plan));
      paramIdx++;
    }
    if (fields?.result !== undefined) {
      updateParts.push(`result = $${paramIdx}`);
      values.push(fields.result);
      paramIdx++;
    }
    if (fields?.error_message !== undefined) {
      updateParts.push(`error_message = $${paramIdx}`);
      values.push(fields.error_message);
      paramIdx++;
    }

    if (status === 'completed' || status === 'failed') {
      updateParts.push(`completed_at = NOW()`);
    }

    await pool.query(
      `UPDATE agent_runs SET ${updateParts.join(', ')} WHERE id = $1`,
      values
    );
  }

  async updateRunHeartbeat(runId: string): Promise<void> {
    await pool.query(
      `UPDATE agent_runs SET last_heartbeat = NOW() WHERE id = $1`,
      [runId]
    );
  }

  async getRun(runId: string): Promise<AgentRunRecord | null> {
    const result = await pool.query<AgentRunRecord>(
      `SELECT * FROM agent_runs WHERE id = $1`,
      [runId]
    );
    return result.rows[0] || null;
  }

  async createWorkers(
    runId: string,
    workers: Array<{ id: string; name: string; task: string }>
  ): Promise<void> {
    for (const w of workers) {
      await pool.query(
        `INSERT INTO agent_workers (id, run_id, name, task, status)
         VALUES ($1, $2, $3, $4, 'waiting')`,
        [w.id, runId, w.name, w.task]
      );
    }
  }

  async updateWorkerStatus(
    workerId: string,
    status: AgentWorkerRecord['status'],
    fields?: { result?: string; tokens_used?: number; progress_log?: string }
  ): Promise<void> {
    const updateParts = [`status = $2`];
    const values: any[] = [workerId, status];
    let paramIdx = 3;

    if (fields?.result !== undefined) {
      updateParts.push(`result = $${paramIdx}`);
      values.push(fields.result);
      paramIdx++;
    }
    if (fields?.tokens_used !== undefined) {
      updateParts.push(`tokens_used = $${paramIdx}`);
      values.push(fields.tokens_used);
      paramIdx++;
    }
    if (fields?.progress_log !== undefined) {
      updateParts.push(`progress_log = $${paramIdx}`);
      values.push(fields.progress_log);
      paramIdx++;
    }

    if (status === 'completed' || status === 'failed') {
      updateParts.push(`completed_at = NOW()`);
    }
    if (status === 'running') {
      updateParts.push(`started_at = NOW()`);
    }

    await pool.query(
      `UPDATE agent_workers SET ${updateParts.join(', ')} WHERE id = $1`,
      values
    );
  }

  async appendWorkerProgress(workerId: string, logLine: string): Promise<void> {
    await pool.query(
      `UPDATE agent_workers
       SET progress_log = COALESCE(progress_log || E'\\n\\n', '') || $2,
           last_heartbeat = NOW()
       WHERE id = $1`,
      [workerId, logLine]
    );
  }

  async getRunWorkers(runId: string): Promise<AgentWorkerRecord[]> {
    const result = await pool.query<AgentWorkerRecord>(
      `SELECT * FROM agent_workers WHERE run_id = $1 ORDER BY started_at`,
      [runId]
    );
    return result.rows;
  }

  async getUserSettings(userId: string): Promise<UserSettings | null> {
    const result = await pool.query<UserSettings>(
      `SELECT github_token, tavily_api_key, google_api_key, anthropic_api_key,
              system_message
       FROM user_settings WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  async getUserRuns(userId: string, limit: number = 30): Promise<Array<AgentRunRecord & { workers: AgentWorkerRecord[] }>> {
    const runsResult = await pool.query<AgentRunRecord>(
      `SELECT id, conversation_id, user_id, status, prompt, plan, result,
              error_message, started_at, completed_at, cancelled_at, last_heartbeat,
              llm_model, llm_provider
       FROM agent_runs
       WHERE user_id = $1
       ORDER BY started_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    const runs = runsResult.rows;
    if (runs.length === 0) return [];

    const runIds = runs.map(r => r.id);
    const workersResult = await pool.query<AgentWorkerRecord>(
      `SELECT * FROM agent_workers WHERE run_id = ANY($1) ORDER BY started_at`,
      [runIds]
    );

    const workersByRun = new Map<string, AgentWorkerRecord[]>();
    for (const w of workersResult.rows) {
      if (!workersByRun.has(w.run_id)) workersByRun.set(w.run_id, []);
      workersByRun.get(w.run_id)!.push(w);
    }

    return runs.map(r => ({ ...r, workers: workersByRun.get(r.id) || [] }));
  }

  async cancelRun(runId: string): Promise<boolean> {
    const result = await pool.query(
      `UPDATE agent_runs
       SET cancelled_at = NOW(), status = 'failed',
           error_message = COALESCE(error_message, '') || CASE WHEN error_message IS NULL THEN '' ELSE ' | ' END || 'Cancelled by user',
           completed_at = NOW()
       WHERE id = $1 AND cancelled_at IS NULL AND status NOT IN ('completed', 'failed')`,
      [runId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async isRunCancelled(runId: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT cancelled_at FROM agent_runs WHERE id = $1`,
      [runId]
    );
    return result.rows.length > 0 && result.rows[0].cancelled_at !== null;
  }
}
