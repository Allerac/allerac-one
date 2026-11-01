/**
 * Background sweep for late federated replies (federation P4c).
 *
 * Every INBOX_POLL_SWEEP_EVERY_MS (default 15s) it asks paired peers for the
 * results of pending async inbox messages that are due, so unread badges
 * update even when nobody has the inbox open. Browsers poll as well
 * (GET /api/inbox/updates, GET /api/inbox/threads/:id); claimPoll() keeps the
 * two from polling the same message. Only one process sweeps at a time
 * (Postgres advisory lock), and a run never overlaps the previous one.
 */

export interface InboxPollSweepDeps {
  /** Resolves due messages for all users; returns how many were resolved. */
  pollDue(): Promise<number>;
  /** Runs `task` while holding the cross-process lock; returns null when another process holds it. */
  withLock<T>(task: () => Promise<T>): Promise<T | null>;
  log?: (line: string) => void;
}

export const DEFAULT_SWEEP_EVERY_MS = 15_000;

export function sweepEveryMs(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.INBOX_POLL_SWEEP_EVERY_MS);
  return Number.isInteger(value) && value >= 1_000 ? value : DEFAULT_SWEEP_EVERY_MS;
}

export class InboxPollSweep {
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: InboxPollSweepDeps) {}

  /** One run; skipped (returns null) when a previous run is still going or another process holds the lock. */
  async runOnce(): Promise<number | null> {
    if (this.running) return null;
    this.running = true;
    try {
      return await this.deps.withLock(() => this.deps.pollDue());
    } catch (error) {
      (this.deps.log ?? console.warn)(`[Inbox] poll sweep failed: ${error instanceof Error ? error.message : 'error'}`);
      return null;
    } finally {
      this.running = false;
    }
  }

  start(everyMs: number): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.runOnce(); }, everyMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

const LOCK_SQL = "SELECT pg_try_advisory_lock(hashtext('allerac_inbox_poll_sweep')) AS acquired";
const UNLOCK_SQL = "SELECT pg_advisory_unlock(hashtext('allerac_inbox_poll_sweep'))";

/** Starts the DB-backed sweep (called from instrumentation when background workers are enabled). */
export async function startInboxPollSweep(): Promise<void> {
  if (process.env.INBOX_POLL_SWEEP_ENABLED === 'false') return;
  const pool = (await import('@/app/clients/db')).default;
  const { inboxService } = await import('./inbox.instance');
  const { POLLS_PER_SWEEP } = await import('./inbox.service');
  const sweep = new InboxPollSweep({
    pollDue: () => inboxService.pollDue(null, POLLS_PER_SWEEP),
    async withLock(task) {
      const client = await pool.connect();
      let locked = false;
      try {
        locked = !!(await client.query(LOCK_SQL)).rows[0]?.acquired;
        if (!locked) return null;
        return await task();
      } finally {
        if (locked) await client.query(UNLOCK_SQL).catch(() => undefined);
        client.release();
      }
    },
  });
  sweep.start(sweepEveryMs());
}
