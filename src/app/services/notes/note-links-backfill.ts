/**
 * One-off, idempotent backfill of knowledge_links for notes written before
 * [[Page]] parsing existed (links_synced_at IS NULL). It runs once per process
 * start, after a delay, one note at a time with a short pause, and only in
 * one process (Postgres advisory lock). No embeddings are involved, so it is
 * cheap; the throttle just keeps it from competing with interactive work.
 * Notes are re-checked on every start until parsed, so a crash is harmless.
 */

export interface NoteLinksBackfillConfig {
  enabled: boolean;
  startDelayMs: number;
  intervalMs: number;
  batchSize: number;
  maxPerRun: number;
}

function envInt(name: string, fallback: number, min = 0): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
}

export function loadNoteLinksBackfillConfig(): NoteLinksBackfillConfig {
  return {
    enabled: process.env.NOTE_LINKS_BACKFILL_ENABLED !== 'false',
    startDelayMs: envInt('NOTE_LINKS_BACKFILL_DELAY_MS', 30_000),
    intervalMs: envInt('NOTE_LINKS_BACKFILL_INTERVAL_MS', 100),
    batchSize: envInt('NOTE_LINKS_BACKFILL_BATCH_SIZE', 50, 1),
    maxPerRun: envInt('NOTE_LINKS_BACKFILL_MAX_PER_RUN', 5_000, 1),
  };
}

export interface BackfillCandidate { id: string; user_id: string; content: string }

export interface NoteLinksBackfillDeps {
  findCandidates: (afterId: string | null, limit: number) => Promise<BackfillCandidate[]>;
  sync: (userId: string, noteId: string, content: string) => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
}

export interface BackfillSummary { synced: number; failed: number }

export const NOTE_LINKS_BACKFILL_CANDIDATES_SQL = `
  SELECT id, user_id, content
  FROM user_notes
  WHERE links_synced_at IS NULL
    AND content LIKE '%[[%'
    AND ($1::uuid IS NULL OR id > $1::uuid)
  ORDER BY id
  LIMIT $2`;

export async function runNoteLinksBackfill(config: NoteLinksBackfillConfig, deps: NoteLinksBackfillDeps): Promise<BackfillSummary> {
  const summary: BackfillSummary = { synced: 0, failed: 0 };
  let afterId: string | null = null;
  let processed = 0;
  while (processed < config.maxPerRun) {
    const batch = await deps.findCandidates(afterId, Math.min(config.batchSize, config.maxPerRun - processed));
    if (batch.length === 0) break;
    for (const note of batch) {
      afterId = note.id;
      processed += 1;
      try {
        await deps.sync(note.user_id, note.id, note.content);
        summary.synced += 1;
      } catch {
        // Left with links_synced_at NULL, so the next start retries it.
        summary.failed += 1;
      }
      if (config.intervalMs > 0) await deps.sleep(config.intervalMs);
    }
  }
  return summary;
}

export function startNoteLinksBackfill(): void {
  const g = globalThis as { __allerac_note_links_backfill_started?: boolean };
  if (g.__allerac_note_links_backfill_started) return;
  g.__allerac_note_links_backfill_started = true;

  const config = loadNoteLinksBackfillConfig();
  if (!config.enabled) return;

  const timer = setTimeout(() => {
    void (async () => {
      const pool = (await import('@/app/clients/db')).default;
      const { noteLinksService } = await import('./note-links.service');
      const client = await pool.connect();
      let locked = false;
      try {
        const lock = await client.query("SELECT pg_try_advisory_lock(hashtext('allerac_note_links_backfill')) AS acquired");
        locked = !!lock.rows[0]?.acquired;
        if (!locked) return;
        const summary = await runNoteLinksBackfill(config, {
          findCandidates: async (afterId, limit) =>
            (await pool.query(NOTE_LINKS_BACKFILL_CANDIDATES_SQL, [afterId, limit])).rows as BackfillCandidate[],
          sync: (userId, noteId, content) => noteLinksService.syncNoteLinks(userId, noteId, content),
          sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
        });
        if (summary.synced + summary.failed > 0) console.log('[NoteLinksBackfill] Done:', JSON.stringify(summary));
      } catch (error) {
        console.error('[NoteLinksBackfill] Failed:', error);
      } finally {
        if (locked) await client.query("SELECT pg_advisory_unlock(hashtext('allerac_note_links_backfill'))").catch(() => undefined);
        client.release();
      }
    })();
  }, config.startDelayMs);
  (timer as { unref?: () => void }).unref?.();
}
