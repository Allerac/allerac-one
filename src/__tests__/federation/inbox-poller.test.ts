/** @jest-environment node */
import { DEFAULT_SWEEP_EVERY_MS, InboxPollSweep, sweepEveryMs } from '@/federation/inbox-poller';

describe('InboxPollSweep', () => {
  it('runs under the lock and skips when another process holds it', async () => {
    const pollDue = jest.fn().mockResolvedValue(2);
    const sweep = new InboxPollSweep({ pollDue, withLock: async task => task() });
    expect(await sweep.runOnce()).toBe(2);
    const locked = new InboxPollSweep({ pollDue, withLock: async () => null });
    expect(await locked.runOnce()).toBeNull();
    expect(pollDue).toHaveBeenCalledTimes(1);
  });

  it('never overlaps runs and survives errors', async () => {
    let release: (value: number) => void = () => undefined;
    const pollDue = jest.fn(() => new Promise<number>(resolve => { release = resolve; }));
    const sweep = new InboxPollSweep({ pollDue, withLock: async task => task() });
    const first = sweep.runOnce();
    expect(await sweep.runOnce()).toBeNull();
    release(0);
    await first;
    const log = jest.fn();
    const failing = new InboxPollSweep({ pollDue: async () => { throw new Error('db down'); }, withLock: async task => task(), log });
    expect(await failing.runOnce()).toBeNull();
    expect(log.mock.calls[0][0]).toContain('db down');
  });

  it('reads the interval from env with a 1s floor', () => {
    expect(sweepEveryMs({})).toBe(DEFAULT_SWEEP_EVERY_MS);
    expect(sweepEveryMs({ INBOX_POLL_SWEEP_EVERY_MS: '20000' })).toBe(20_000);
    expect(sweepEveryMs({ INBOX_POLL_SWEEP_EVERY_MS: '10' })).toBe(DEFAULT_SWEEP_EVERY_MS);
  });
});
