'use server';

import { requireCurrentUser } from '@/app/lib/auth-session';
import { clearBenchmarkRuns, getBenchmarkModelAvailability, listBenchmarkRuns } from '@/app/services/benchmark/benchmark-query.service';

export interface BenchmarkAvailability {
  providers: Record<'github' | 'gemini' | 'anthropic' | 'ollama', boolean>;
  ollamaModels: string[];
}

export async function getBenchmarkAvailability(): Promise<BenchmarkAvailability> {
  const user = await requireCurrentUser();
  return getBenchmarkModelAvailability(user.id);
}

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
    return await listBenchmarkRuns(user.id, limit);
  } catch {
    return [];
  }
}

/**
 * Delete all benchmark results for a user.
 */
export async function clearBenchmarkHistory(): Promise<void> {
  const user = await requireCurrentUser();
  await clearBenchmarkRuns(user.id);
}
