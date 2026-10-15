import '../../__mocks__/db';
import pool from '@/app/clients/db';
import { loadMemoryIndexSweepConfig, runMemoryIndexSweepOnce } from '@/app/services/knowledge/memory-index-sweep';

jest.mock('@/app/services/rag/embedding.service', () => ({
  EmbeddingService: jest.fn().mockImplementation(() => ({
    getMetadata: () => ({ provider: 'ollama', model: 'm', dimensions: 768, version: 'v1' }),
    generateEmbedding: jest.fn(),
  })),
}));

const ENV_KEYS = ['MEMORY_INDEX_SWEEP_ENABLED', 'MEMORY_INDEX_SWEEP_EVERY_MS', 'MEMORY_INDEX_SWEEP_INTERVAL_MS', 'MEMORY_INDEX_SWEEP_MAX_PER_RUN'];

describe('memory index sweep', () => {
  afterEach(() => ENV_KEYS.forEach(key => delete process.env[key]));

  it('defaults to a slow, capped background sweep', () => {
    const config = loadMemoryIndexSweepConfig();
    expect(config).toEqual(expect.objectContaining({ enabled: true, everyMs: 300_000, intervalMs: 2_000, maxPerRun: 200 }));
  });

  it('reads overrides and ignores invalid values', () => {
    process.env.MEMORY_INDEX_SWEEP_ENABLED = 'false';
    process.env.MEMORY_INDEX_SWEEP_EVERY_MS = '0';
    process.env.MEMORY_INDEX_SWEEP_INTERVAL_MS = 'soon';
    process.env.MEMORY_INDEX_SWEEP_MAX_PER_RUN = '0';
    const config = loadMemoryIndexSweepConfig();
    expect(config.enabled).toBe(false);
    expect(config.everyMs).toBe(0);
    expect(config.intervalMs).toBe(2_000);
    expect(config.maxPerRun).toBe(200);
  });

  it('does nothing when another process holds the sweep lock', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ acquired: false }] }), release: jest.fn() };
    jest.mocked(pool.connect).mockResolvedValue(client as never);
    const result = await runMemoryIndexSweepOnce(loadMemoryIndexSweepConfig());
    expect(result).toBeNull();
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('indexes candidates one by one while holding the lock, then unlocks', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ acquired: true }] }), release: jest.fn() };
    jest.mocked(pool.connect).mockResolvedValue(client as never);
    jest.mocked(pool.query).mockReset();
    jest.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 'mem-1', user_id: 'user-1' }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never) // indexMemory: memory gone
      .mockResolvedValueOnce({ rows: [] } as never); // next candidate page
    const result = await runMemoryIndexSweepOnce({ ...loadMemoryIndexSweepConfig(), intervalMs: 0 });
    expect(result).toEqual(expect.objectContaining({ checked: 1, skipped: 1, failed: 0, aborted: false }));
    expect(jest.mocked(pool.query).mock.calls[0][1]).toEqual([null, 25, 'v1']);
    expect(client.query).toHaveBeenLastCalledWith(expect.stringContaining('pg_advisory_unlock'));
  });
});
