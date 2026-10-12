/**
 * Startup sweep that re-embeds notes whose semantic index is missing or stale
 * (NULL/outdated content_hash, missing or unfinished document).
 *
 * It is deliberately slow and polite so it is safe on a small machine running
 * with EMBEDDING_MAX_CONCURRENT=1:
 * - notes are processed one at a time, with a pause between them;
 * - each embedding goes through the shared EmbeddingScheduler at background
 *   ('document') priority, and the sweep also waits while the scheduler has
 *   any queued work, so chat queries and user saves always go first;
 * - a run is capped, and it stops after repeated failures (e.g. the embedding
 *   backend is down) instead of hammering it;
 * - only one process runs it at a time (Postgres advisory lock).
 */

export interface NoteReindexSweepConfig {
  enabled: boolean;
  startDelayMs: number;
  intervalMs: number;
  batchSize: number;
  maxPerRun: number;
  maxConsecutiveFailures: number;
  busyBackoffMs: number;
}

function envInt(name: string, fallback: number, min = 0): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
}

export function loadNoteReindexSweepConfig(): NoteReindexSweepConfig {
  return {
    enabled: process.env.NOTE_REINDEX_SWEEP_ENABLED !== 'false',
    startDelayMs: envInt('NOTE_REINDEX_SWEEP_DELAY_MS', 60_000),
    intervalMs: envInt('NOTE_REINDEX_SWEEP_INTERVAL_MS', 2_000),
    batchSize: envInt('NOTE_REINDEX_SWEEP_BATCH_SIZE', 25, 1),
    maxPerRun: envInt('NOTE_REINDEX_SWEEP_MAX_PER_RUN', 500, 1),
    maxConsecutiveFailures: envInt('NOTE_REINDEX_SWEEP_MAX_FAILURES', 3, 1),
    busyBackoffMs: envInt('NOTE_REINDEX_SWEEP_BUSY_BACKOFF_MS', 5_000, 1),
  };
}

type ReindexOutcome = 'reindexed' | 'skipped' | 'missing' | 'failed';

export interface SweepCandidate {
  id: string;
  user_id: string;
}

export interface NoteReindexSweepDeps {
  /** Next candidates with id greater than `afterId` (keyset paging). */
  findCandidates: (afterId: string | null, limit: number) => Promise<SweepCandidate[]>;
  reindex: (userId: string, noteId: string) => Promise<ReindexOutcome>;
  /** Number of embedding jobs queued in the shared scheduler. */
  pendingEmbeddings: () => number;
  sleep: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

export interface SweepSummary {
  checked: number;
  reindexed: number;
  skipped: number;
  failed: number;
  aborted: boolean;
}

/** Maximum time spent waiting for a busy scheduler before giving up on the run. */
const MAX_BUSY_WAITS = 120;

export async function runNoteReindexSweep(config: NoteReindexSweepConfig, deps: NoteReindexSweepDeps): Promise<SweepSummary> {
  const summary: SweepSummary = { checked: 0, reindexed: 0, skipped: 0, failed: 0, aborted: false };
  let afterId: string | null = null;
  let consecutiveFailures = 0;

  while (summary.checked < config.maxPerRun) {
    const limit = Math.min(config.batchSize, config.maxPerRun - summary.checked);
    const batch = await deps.findCandidates(afterId, limit);
    if (batch.length === 0) break;

    for (const candidate of batch) {
      afterId = candidate.id;

      // Yield to any queued embedding work (interactive queries, user saves).
      let waits = 0;
      while (deps.pendingEmbeddings() > 0) {
        if (++waits > MAX_BUSY_WAITS) {
          summary.aborted = true;
          deps.log?.('[NoteSweep] Embedding scheduler stayed busy; stopping this run');
          return summary;
        }
        await deps.sleep(config.busyBackoffMs);
      }

      summary.checked += 1;
      let outcome: ReindexOutcome;
      try {
        outcome = await deps.reindex(candidate.user_id, candidate.id);
      } catch {
        outcome = 'failed';
      }

      if (outcome === 'failed') {
        summary.failed += 1;
        consecutiveFailures += 1;
        if (consecutiveFailures >= config.maxConsecutiveFailures) {
          summary.aborted = true;
          deps.log?.(`[NoteSweep] ${consecutiveFailures} consecutive failures; stopping until next start`);
          return summary;
        }
      } else {
        consecutiveFailures = 0;
        if (outcome === 'reindexed') summary.reindexed += 1;
        else summary.skipped += 1;
      }

      if (summary.checked >= config.maxPerRun) break;
      if (outcome === 'reindexed' || outcome === 'failed') await deps.sleep(config.intervalMs);
    }
  }

  return summary;
}

/**
 * SQL predicate for notes whose index may be stale. The hash expression mirrors
 * buildNoteIndexText/hashNoteIndexText; any remaining edge-case mismatch only
 * makes a note a candidate, and reindexNote then skips it after an exact check.
 */
export const STALE_NOTE_CANDIDATES_SQL = `
  SELECT n.id, n.user_id
  FROM user_notes n
  LEFT JOIN documents d ON d.id = n.document_id AND d.uploaded_by = n.user_id
  WHERE n.archived_at IS NULL
    AND (btrim(coalesce(n.title, '')) <> '' OR btrim(n.content) <> '')
    AND ($1::uuid IS NULL OR n.id > $1::uuid)
    AND (
      n.content_hash IS NULL
      OR d.id IS NULL
      OR d.status <> 'completed'
      OR n.content_hash <> encode(sha256(convert_to(
           CASE WHEN btrim(coalesce(n.title, ''), E' \\t\\n\\r') <> ''
                THEN btrim(n.title, E' \\t\\n\\r') || E'\\n\\n' || n.content
                ELSE n.content END, 'UTF8')), 'hex')
    )
  ORDER BY n.id
  LIMIT $2`;

/** Starts the sweep once per process after the configured delay. */
export function startNoteReindexSweep(): void {
  const g = globalThis as { __allerac_note_sweep_started?: boolean };
  if (g.__allerac_note_sweep_started) return;
  g.__allerac_note_sweep_started = true;

  const config = loadNoteReindexSweepConfig();
  if (!config.enabled) return;

  const timer = setTimeout(() => {
    void (async () => {
      const pool = (await import('@/app/clients/db')).default;
      const { embeddingScheduler } = await import('@/app/services/rag/embedding-scheduler');
      const { NotesService } = await import('./notes.service');
      const notes = new NotesService();
      const client = await pool.connect();
      let locked = false;
      try {
        const lock = await client.query("SELECT pg_try_advisory_lock(hashtext('allerac_note_reindex_sweep')) AS acquired");
        locked = !!lock.rows[0]?.acquired;
        if (!locked) return;
        const summary = await runNoteReindexSweep(config, {
          findCandidates: async (afterId, limit) =>
            (await pool.query(STALE_NOTE_CANDIDATES_SQL, [afterId, limit])).rows as SweepCandidate[],
          reindex: (userId, noteId) => notes.reindexNote(userId, noteId),
          pendingEmbeddings: () => {
            const stats = embeddingScheduler.getStats();
            return stats.queuedInteractive + stats.queuedBackground;
          },
          sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
          log: message => console.warn(message),
        });
        if (summary.checked > 0) console.log('[NoteSweep] Done:', JSON.stringify(summary));
      } catch (error) {
        console.error('[NoteSweep] Failed:', error);
      } finally {
        if (locked) await client.query("SELECT pg_advisory_unlock(hashtext('allerac_note_reindex_sweep'))").catch(() => undefined);
        client.release();
      }
    })();
  }, config.startDelayMs);
  (timer as { unref?: () => void }).unref?.();
}
