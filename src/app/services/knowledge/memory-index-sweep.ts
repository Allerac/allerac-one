/**
 * Periodic background sweep that embeds new or changed memories.
 *
 * It reuses the polite note sweep loop (runNoteReindexSweep): one memory at a
 * time with a pause between embeddings, yielding whenever the shared
 * EmbeddingScheduler has queued work, a cap per run, and a stop after repeated
 * failures. Only one process runs it at a time (Postgres advisory lock).
 * Memories that are not indexed yet are still found by the lexical fallback
 * of the knowledge search.
 */

import { runNoteReindexSweep, type NoteReindexSweepConfig, type SweepSummary } from '@/app/services/notes/note-reindex-sweep';

export interface MemoryIndexSweepConfig extends NoteReindexSweepConfig {
  /** Pause between two runs; 0 runs only once at startup. */
  everyMs: number;
}

function envInt(name: string, fallback: number, min = 0): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
}

export function loadMemoryIndexSweepConfig(): MemoryIndexSweepConfig {
  return {
    enabled: process.env.MEMORY_INDEX_SWEEP_ENABLED !== 'false',
    startDelayMs: envInt('MEMORY_INDEX_SWEEP_DELAY_MS', 90_000),
    everyMs: envInt('MEMORY_INDEX_SWEEP_EVERY_MS', 300_000),
    intervalMs: envInt('MEMORY_INDEX_SWEEP_INTERVAL_MS', 2_000),
    batchSize: envInt('MEMORY_INDEX_SWEEP_BATCH_SIZE', 25, 1),
    maxPerRun: envInt('MEMORY_INDEX_SWEEP_MAX_PER_RUN', 200, 1),
    maxConsecutiveFailures: envInt('MEMORY_INDEX_SWEEP_MAX_FAILURES', 3, 1),
    busyBackoffMs: envInt('MEMORY_INDEX_SWEEP_BUSY_BACKOFF_MS', 5_000, 1),
  };
}

const LOCK_SQL = "SELECT pg_try_advisory_lock(hashtext('allerac_memory_index_sweep')) AS acquired";
const UNLOCK_SQL = "SELECT pg_advisory_unlock(hashtext('allerac_memory_index_sweep'))";

/** One locked sweep run. Exported for tests and manual rebuilds. */
export async function runMemoryIndexSweepOnce(config: MemoryIndexSweepConfig): Promise<SweepSummary | null> {
  const pool = (await import('@/app/clients/db')).default;
  const { embeddingScheduler } = await import('@/app/services/rag/embedding-scheduler');
  const { MemoryIndexService, STALE_MEMORY_CANDIDATES_SQL } = await import('./memory-index.service');
  const index = new MemoryIndexService();
  const version = index.embeddingVersion();
  const client = await pool.connect();
  let locked = false;
  try {
    locked = !!(await client.query(LOCK_SQL)).rows[0]?.acquired;
    if (!locked) return null;
    return await runNoteReindexSweep(config, {
      findCandidates: async (afterId, limit) =>
        (await pool.query(STALE_MEMORY_CANDIDATES_SQL, [afterId, limit, version])).rows,
      reindex: (userId, memoryId) => index.indexMemory(userId, memoryId),
      pendingEmbeddings: () => {
        const stats = embeddingScheduler.getStats();
        return stats.queuedInteractive + stats.queuedBackground;
      },
      sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
      log: message => console.warn(message.replace('[NoteSweep]', '[MemoryIndexSweep]')),
    });
  } finally {
    if (locked) await client.query(UNLOCK_SQL).catch(() => undefined);
    client.release();
  }
}

/** Starts the periodic sweep once per process. */
export function startMemoryIndexSweep(): void {
  const g = globalThis as { __allerac_memory_index_sweep_started?: boolean };
  if (g.__allerac_memory_index_sweep_started) return;
  g.__allerac_memory_index_sweep_started = true;

  const config = loadMemoryIndexSweepConfig();
  if (!config.enabled) return;

  const run = async () => {
    try {
      const summary = await runMemoryIndexSweepOnce(config);
      if (summary && summary.checked > 0) console.log('[MemoryIndexSweep] Done:', JSON.stringify(summary));
    } catch (error) {
      console.error('[MemoryIndexSweep] Failed:', error);
    }
    if (config.everyMs > 0) {
      const next = setTimeout(() => void run(), config.everyMs);
      (next as { unref?: () => void }).unref?.();
    }
  };

  const timer = setTimeout(() => void run(), config.startDelayMs);
  (timer as { unref?: () => void }).unref?.();
}
