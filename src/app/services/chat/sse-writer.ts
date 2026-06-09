export function encodeSseEvent(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export class SseWriter {
  private closed = false;
  private readonly encoder = new TextEncoder();

  constructor(
    private readonly controller: ReadableStreamDefaultController<Uint8Array>,
    signal?: AbortSignal,
  ) {
    signal?.addEventListener('abort', () => {
      this.closed = true;
    });
  }

  keepalive(): void {
    this.enqueue(this.encoder.encode(': keepalive\n\n'));
  }

  event(data: object): void {
    this.enqueue(encodeSseEvent(data));
  }

  write(data: Uint8Array): void {
    this.enqueue(data);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.controller.close();
    } catch {
      // Client disconnected between the state check and close.
    }
  }

  startKeepalive(intervalMs = 15_000): ReturnType<typeof setInterval> {
    return setInterval(() => this.keepalive(), intervalMs);
  }

  private enqueue(data: Uint8Array): void {
    if (this.closed) return;
    try {
      this.controller.enqueue(data);
    } catch {
      this.closed = true;
    }
  }
}

export const SSE_RESPONSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;
