import type { EmbeddingPurpose } from './embedding-provider';

interface PendingWork<T> {
  priority: number;
  sequence: number;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

const DEFAULT_CONCURRENCY = 1;

function configuredConcurrency(): number {
  const parsed = Number(process.env.EMBEDDING_MAX_CONCURRENT ?? DEFAULT_CONCURRENCY);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_CONCURRENCY;
}

export class EmbeddingScheduler {
  private active = 0;
  private sequence = 0;
  private readonly queue: PendingWork<unknown>[] = [];

  constructor(private readonly maxConcurrent = configuredConcurrency()) {}

  schedule<T>(purpose: EmbeddingPurpose, run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        priority: purpose === 'query' ? 0 : 1,
        sequence: this.sequence++,
        run,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.drain();
    });
  }

  getStats(): { active: number; queuedInteractive: number; queuedBackground: number; maxConcurrent: number } {
    return {
      active: this.active,
      queuedInteractive: this.queue.filter((item) => item.priority === 0).length,
      queuedBackground: this.queue.filter((item) => item.priority !== 0).length,
      maxConcurrent: this.maxConcurrent,
    };
  }

  private drain(): void {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      this.queue.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
      const item = this.queue.shift()!;
      this.active += 1;
      item.run()
        .then(item.resolve, item.reject)
        .finally(() => {
          this.active -= 1;
          this.drain();
        });
    }
  }
}

export const embeddingScheduler = new EmbeddingScheduler();
