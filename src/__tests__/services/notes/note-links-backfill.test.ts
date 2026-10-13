import {
  loadNoteLinksBackfillConfig, runNoteLinksBackfill, NOTE_LINKS_BACKFILL_CANDIDATES_SQL, NoteLinksBackfillConfig,
} from '@/app/services/notes/note-links-backfill';

const cfg: NoteLinksBackfillConfig = { enabled: true, startDelayMs: 0, intervalMs: 50, batchSize: 2, maxPerRun: 100 };

function source(n: number) {
  const all = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, user_id: 'u1', content: `[[P${i}]]` }));
  return jest.fn(async (afterId: string | null, limit: number) => all.filter(c => afterId === null || c.id > afterId).slice(0, limit));
}

describe('runNoteLinksBackfill', () => {
  it('syncs each candidate once, sequentially, with a pause', async () => {
    const order: string[] = [];
    const sync = jest.fn(async (_u: string, id: string) => { order.push(`sync:${id}`); });
    const sleep = jest.fn(async (ms: number) => { order.push(`sleep:${ms}`); });
    const res = await runNoteLinksBackfill(cfg, { findCandidates: source(3), sync, sleep });
    expect(res).toEqual({ synced: 3, failed: 0 });
    expect(order).toEqual(['sync:n0', 'sleep:50', 'sync:n1', 'sleep:50', 'sync:n2', 'sleep:50']);
    expect(sync).toHaveBeenCalledWith('u1', 'n0', '[[P0]]');
  });

  it('keeps going after a failure and counts it', async () => {
    const sync = jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined);
    const res = await runNoteLinksBackfill(cfg, { findCandidates: source(3), sync, sleep: async () => undefined });
    expect(res).toEqual({ synced: 2, failed: 1 });
  });

  it('caps a run and pages by id', async () => {
    const find = source(10);
    const res = await runNoteLinksBackfill({ ...cfg, maxPerRun: 3 }, { findCandidates: find, sync: async () => undefined, sleep: async () => undefined });
    expect(res.synced).toBe(3);
    expect(find.mock.calls).toEqual([[null, 2], ['n1', 1]]);
  });

  it('only selects unparsed notes that contain [[', () => {
    expect(NOTE_LINKS_BACKFILL_CANDIDATES_SQL).toContain('links_synced_at IS NULL');
    expect(NOTE_LINKS_BACKFILL_CANDIDATES_SQL).toContain("content LIKE '%[[%'");
  });

  it('reads config with safe defaults', () => {
    const saved = { ...process.env };
    process.env.NOTE_LINKS_BACKFILL_ENABLED = 'false';
    process.env.NOTE_LINKS_BACKFILL_BATCH_SIZE = '-1';
    const c = loadNoteLinksBackfillConfig();
    expect(c.enabled).toBe(false);
    expect(c.batchSize).toBe(50);
    expect(c.maxPerRun).toBe(5000);
    process.env = saved;
  });
});
