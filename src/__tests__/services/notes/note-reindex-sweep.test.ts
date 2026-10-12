import {
  loadNoteReindexSweepConfig, runNoteReindexSweep, NoteReindexSweepConfig, STALE_NOTE_CANDIDATES_SQL,
} from '@/app/services/notes/note-reindex-sweep';
import { buildNoteIndexText } from '@/app/services/notes/note-reindex-queue';

const base: NoteReindexSweepConfig = {
  enabled: true, startDelayMs: 0, intervalMs: 1000, batchSize: 2, maxPerRun: 100, maxConsecutiveFailures: 3, busyBackoffMs: 500,
};

function candidates(n: number) {
  const all = Array.from({ length: n }, (_, i) => ({ id: `n${String(i).padStart(3, '0')}`, user_id: 'u1' }));
  return jest.fn(async (afterId: string | null, limit: number) => all.filter(c => afterId === null || c.id > afterId).slice(0, limit));
}

describe('runNoteReindexSweep', () => {
  it('processes notes one at a time with a pause after each re-embed', async () => {
    const events: string[] = [];
    let active = 0;
    let maxActive = 0;
    const reindex = jest.fn(async (_u: string, id: string) => {
      active++; maxActive = Math.max(maxActive, active);
      events.push(`reindex:${id}`);
      await Promise.resolve();
      active--;
      return 'reindexed' as const;
    });
    const sleep = jest.fn(async (ms: number) => { events.push(`sleep:${ms}`); });
    const summary = await runNoteReindexSweep(base, { findCandidates: candidates(3), reindex, pendingEmbeddings: () => 0, sleep });
    expect(summary).toEqual({ checked: 3, reindexed: 3, skipped: 0, failed: 0, aborted: false });
    expect(maxActive).toBe(1);
    expect(events).toEqual(['reindex:n000', 'sleep:1000', 'reindex:n001', 'sleep:1000', 'reindex:n002', 'sleep:1000']);
  });

  it('does not pause after a skipped note', async () => {
    const sleep = jest.fn(async () => undefined);
    const summary = await runNoteReindexSweep(base, {
      findCandidates: candidates(2), reindex: async () => 'skipped', pendingEmbeddings: () => 0, sleep,
    });
    expect(summary.skipped).toBe(2);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('waits while the embedding scheduler has queued work', async () => {
    let pending = 2;
    const sleep = jest.fn(async () => { pending = Math.max(0, pending - 1); });
    const reindex = jest.fn(async () => 'skipped' as const);
    await runNoteReindexSweep(base, { findCandidates: candidates(1), reindex, pendingEmbeddings: () => pending, sleep });
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
    expect(reindex).toHaveBeenCalledTimes(1);
  });

  it('gives up when the scheduler never drains', async () => {
    const reindex = jest.fn();
    const summary = await runNoteReindexSweep(base, {
      findCandidates: candidates(1), reindex, pendingEmbeddings: () => 1, sleep: async () => undefined,
    });
    expect(summary.aborted).toBe(true);
    expect(reindex).not.toHaveBeenCalled();
  });

  it('stops after consecutive failures', async () => {
    const reindex = jest.fn()
      .mockResolvedValueOnce('failed')
      .mockRejectedValueOnce(new Error('ollama down'))
      .mockResolvedValue('failed');
    const summary = await runNoteReindexSweep(base, {
      findCandidates: candidates(10), reindex, pendingEmbeddings: () => 0, sleep: async () => undefined,
    });
    expect(summary).toMatchObject({ checked: 3, failed: 3, aborted: true });
  });

  it('resets the failure streak after a success', async () => {
    const reindex = jest.fn()
      .mockResolvedValueOnce('failed').mockResolvedValueOnce('failed')
      .mockResolvedValueOnce('reindexed')
      .mockResolvedValueOnce('failed').mockResolvedValueOnce('failed');
    const summary = await runNoteReindexSweep(base, {
      findCandidates: candidates(5), reindex, pendingEmbeddings: () => 0, sleep: async () => undefined,
    });
    expect(summary).toMatchObject({ checked: 5, failed: 4, reindexed: 1, aborted: false });
  });

  it('caps the number of notes per run and pages by id', async () => {
    const find = candidates(10);
    const summary = await runNoteReindexSweep({ ...base, maxPerRun: 3 }, {
      findCandidates: find, reindex: async () => 'skipped', pendingEmbeddings: () => 0, sleep: async () => undefined,
    });
    expect(summary.checked).toBe(3);
    expect(find.mock.calls).toEqual([[null, 2], ['n001', 1]]);
  });
});

describe('note sweep configuration', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('has conservative defaults', () => {
    for (const k of Object.keys(process.env)) if (k.startsWith('NOTE_REINDEX_SWEEP_')) delete process.env[k];
    expect(loadNoteReindexSweepConfig()).toEqual({
      enabled: true, startDelayMs: 60000, intervalMs: 2000, batchSize: 25, maxPerRun: 500, maxConsecutiveFailures: 3, busyBackoffMs: 5000,
    });
  });

  it('reads overrides and ignores invalid values', () => {
    process.env.NOTE_REINDEX_SWEEP_ENABLED = 'false';
    process.env.NOTE_REINDEX_SWEEP_INTERVAL_MS = '10000';
    process.env.NOTE_REINDEX_SWEEP_BATCH_SIZE = '0';
    const cfg = loadNoteReindexSweepConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.intervalMs).toBe(10000);
    expect(cfg.batchSize).toBe(25);
  });

  it('candidate SQL skips archived and empty notes and pages by id', () => {
    expect(STALE_NOTE_CANDIDATES_SQL).toContain('n.archived_at IS NULL');
    expect(STALE_NOTE_CANDIDATES_SQL).toContain("n.source NOT LIKE 'connector_root:%'");
    expect(STALE_NOTE_CANDIDATES_SQL).toContain('n.id > $1::uuid');
    expect(STALE_NOTE_CANDIDATES_SQL).toContain('ORDER BY n.id');
    expect(buildNoteIndexText('T', 'c')).toBe('T\n\nc');
  });
});
