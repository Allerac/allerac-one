import pool from '@/app/clients/db';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import type { BenchmarkAvailability, BenchmarkRun } from '@/app/actions/benchmark';

const userSettingsService = new UserSettingsService();
const systemSettingsService = new SystemSettingsService();

export async function listBenchmarkRuns(userId: string, limit = 5): Promise<BenchmarkRun[]> {
  const runs = await pool.query<{ run_id: string; model: string; provider: string; created_at: string }>(
    `SELECT DISTINCT ON (run_id) run_id, model, provider, created_at
     FROM benchmark_results
     WHERE user_id = $1
     ORDER BY run_id, created_at DESC`,
    [userId],
  );

  const selected = runs.rows
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);

  return Promise.all(selected.map(async (run) => {
    const tests = await pool.query(
      `SELECT prompt_name, prompt_label, ttft_ms, total_ms,
              chars_generated, tokens_generated, tokens_per_second
       FROM benchmark_results
       WHERE user_id = $1 AND run_id = $2
       ORDER BY created_at ASC`,
      [userId, run.run_id],
    );
    return { ...run, tests: tests.rows };
  }));
}

export async function clearBenchmarkRuns(userId: string): Promise<number> {
  const result = await pool.query('DELETE FROM benchmark_results WHERE user_id = $1', [userId]);
  return result.rowCount ?? 0;
}

export async function getBenchmarkModelAvailability(userId: string): Promise<BenchmarkAvailability> {
  const [settings, systemSettings] = await Promise.all([
    userSettingsService.loadUserSettings(userId),
    systemSettingsService.loadAll(),
  ]);

  let ollamaModels: string[] = [];
  try {
    const response = await fetch(`${process.env.OLLAMA_BASE_URL || 'http://ollama:11434'}/api/tags`, { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      ollamaModels = Array.isArray(data.models)
        ? data.models.map((model: { name?: string }) => model.name).filter((name: unknown): name is string => typeof name === 'string')
        : [];
    }
  } catch {
    ollamaModels = [];
  }

  return {
    providers: {
      github: Boolean(settings?.github_token || systemSettings.github_token || process.env.GITHUB_TOKEN),
      gemini: Boolean(settings?.google_api_key || systemSettings.google_api_key),
      anthropic: Boolean(settings?.anthropic_api_key || systemSettings.anthropic_api_key),
      ollama: ollamaModels.length > 0,
    },
    ollamaModels,
  };
}
