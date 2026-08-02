import { EmbeddingScheduler } from '@/app/services/rag/embedding-scheduler';

describe('EmbeddingScheduler', () => {
  it('runs queued interactive work before queued background work', async () => {
    const scheduler = new EmbeddingScheduler(1);
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = scheduler.schedule('document', async () => {
      order.push('first-background');
      await firstGate;
    });
    const second = scheduler.schedule('document', async () => {
      order.push('second-background');
    });
    const query = scheduler.schedule('query', async () => {
      order.push('interactive');
    });

    releaseFirst();
    await Promise.all([first, second, query]);

    expect(order).toEqual(['first-background', 'interactive', 'second-background']);
  });
});
