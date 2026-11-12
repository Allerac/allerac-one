/** Coalesce keystrokes while a request is in flight, preserving their order. */
export function createTerminalInputQueue(options: {
  send: (id: string, data: string) => Promise<void>;
  onActivity: () => void;
  onError: (error: unknown) => void;
}) {
  let pending = '';
  let owner: string | null = null;
  let sending = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = async () => {
    timer = undefined;
    if (disposed || sending || !pending || !owner) return;
    const id = owner;
    let length = Math.min(pending.length, 8192);
    // Keep a pasted Unicode code point together across request boundaries.
    if (length < pending.length && /[\uD800-\uDBFF]/.test(pending[length - 1])) length--;
    const data = pending.slice(0, length);
    pending = pending.slice(length);
    sending = true;
    try {
      await options.send(id, data);
      if (!disposed && owner === id) options.onActivity();
    } catch (error) {
      // A lost response may already have delivered the input. Never replay it.
      if (owner === id) {
        pending = '';
        if (!disposed) options.onError(error);
      }
    } finally {
      sending = false;
      if (!disposed && pending) void flush();
    }
  };

  return {
    push(id: string, data: string) {
      if (disposed) return;
      if (owner !== id) { owner = id; pending = ''; }
      pending += data;
      options.onActivity();
      if (!sending && timer === undefined) timer = setTimeout(() => void flush(), 8);
    },
    reset() { pending = ''; owner = null; clearTimeout(timer); timer = undefined; },
    dispose() { disposed = true; pending = ''; clearTimeout(timer); },
  };
}
