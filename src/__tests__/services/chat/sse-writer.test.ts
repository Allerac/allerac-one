import { encodeSseEvent, SseWriter } from '@/app/services/chat/sse-writer';

describe('SseWriter', () => {
  test('encodes protocol events', () => {
    expect(new TextDecoder().decode(encodeSseEvent({ type: 'done' })))
      .toBe('data: {"type":"done"}\n\n');
  });

  test('stops writing after abort', () => {
    const controller = {
      enqueue: jest.fn(),
      close: jest.fn(),
    } as unknown as ReadableStreamDefaultController<Uint8Array>;
    const abort = new AbortController();
    const writer = new SseWriter(controller, abort.signal);

    writer.keepalive();
    abort.abort();
    writer.event({ type: 'token', content: 'ignored' });
    writer.close();

    expect(controller.enqueue).toHaveBeenCalledTimes(1);
    expect(controller.close).not.toHaveBeenCalled();
  });
});
