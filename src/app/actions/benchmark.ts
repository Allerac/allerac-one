'use server';

import pool from '@/app/clients/db';
import { requireCurrentUser } from '@/app/lib/auth-session';

export interface BenchmarkRun {
  run_id: string;
  model: string;
  provider: string;
  created_at: string;
  tests: Array<{
    prompt_name: string;
    prompt_label: string;
    ttft_ms: number | null;
    total_ms: number;
    chars_generated: number;
    tokens_generated: number | null;
    tokens_per_second: number | null;
  }>;
}

/**
 * Load the last N benchmark runs for a user.
 */
export async function getBenchmarkHistory(limit = 5): Promise<BenchmarkRun[]> {
  try {
    const user = await requireCurrentUser();
    // Get distinct run_ids ordered by most recent
    const runsRes = await pool.query<{ run_id: string; model: string; provider: string; created_at: string }>(
      `SELECT DISTINCT ON (run_id) run_id, model, provider, created_at
       FROM benchmark_results
       WHERE user_id = $1
       ORDER BY run_id, created_at DESC`,
      [user.id]
    );

    if (runsRes.rows.length === 0) return [];

    // Sort by created_at and take the last N
    const sortedRuns = runsRes.rows
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);

    // Load tests for each run
    const result: BenchmarkRun[] = await Promise.all(
      sortedRuns.map(async (run) => {
        const testsRes = await pool.query(
          `SELECT prompt_name, prompt_label, ttft_ms, total_ms,
                  chars_generated, tokens_generated, tokens_per_second
           FROM benchmark_results
           WHERE user_id = $1 AND run_id = $2
           ORDER BY created_at ASC`,
          [user.id, run.run_id]
        );
        return {
          run_id: run.run_id,
          model: run.model,
          provider: run.provider,
          created_at: run.created_at,
          tests: testsRes.rows,
        };
      })
    );

    return result;
  } catch {
    return [];
  }
}

/**
 * Delete all benchmark results for a user.
 */
export async function clearBenchmarkHistory(): Promise<void> {
  const user = await requireCurrentUser();
  await pool.query('DELETE FROM benchmark_results WHERE user_id = $1', [user.id]);
}
