import { createTerminalInputQueue } from '@/app/terminal/terminal-input';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('rapid typing is batched and slow requests do not build a request per key', async () => {
  let complete!: () => void;
  const send = jest.fn().mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; })).mockResolvedValue(undefined);
  const queue = createTerminalInputQueue({ send, onActivity: jest.fn(), onError: jest.fn() });
  queue.push('session', 'a'); queue.push('session', 'b');
  await jest.advanceTimersByTimeAsync(8);
  expect(send).toHaveBeenNthCalledWith(1, 'session', 'ab');
  for (const key of ['c', '\u001b[D', '\u007f', 'd', '\r']) queue.push('session', key);
  await jest.advanceTimersByTimeAsync(100);
  expect(send).toHaveBeenCalledTimes(1);
  complete(); await jest.advanceTimersByTimeAsync(0);
  expect(send).toHaveBeenNthCalledWith(2, 'session', 'c\u001b[D\u007fd\r');
  queue.dispose();
});

test('pending input is dropped when the session changes or the page closes', async () => {
  const send = jest.fn().mockResolvedValue(undefined);
  const queue = createTerminalInputQueue({ send, onActivity: jest.fn(), onError: jest.fn() });
  queue.push('old', 'never send'); queue.reset(); queue.push('new', 'hello');
  await jest.advanceTimersByTimeAsync(8);
  expect(send).toHaveBeenCalledWith('new', 'hello');
  queue.push('new', 'discard'); queue.dispose();
  await jest.advanceTimersByTimeAsync(20);
  expect(send).toHaveBeenCalledTimes(1);
});

test('failed requests are not retried or followed by buffered keystrokes', async () => {
  const onError = jest.fn();
  const send = jest.fn().mockRejectedValue(new Error('lost response'));
  const queue = createTerminalInputQueue({ send, onActivity: jest.fn(), onError });
  queue.push('session', 'hello');
  await jest.advanceTimersByTimeAsync(20);
  expect(send).toHaveBeenCalledTimes(1); expect(onError).toHaveBeenCalledTimes(1);
  queue.dispose();
});

test('an old request failure cannot disconnect a newly attached session', async () => {
  let reject!: (error: Error) => void;
  const send = jest.fn().mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; })).mockResolvedValue(undefined);
  const onError = jest.fn();
  const queue = createTerminalInputQueue({ send, onActivity: jest.fn(), onError });
  queue.push('old', 'old input');
  await jest.advanceTimersByTimeAsync(8);
  queue.reset(); queue.push('new', 'new input');
  reject(new Error('old connection lost'));
  await jest.advanceTimersByTimeAsync(8);
  expect(onError).not.toHaveBeenCalled();
  expect(send).toHaveBeenNthCalledWith(2, 'new', 'new input');
  queue.dispose();
});

test('large Unicode pastes respect request limits and retain complete code points', async () => {
  const send = jest.fn().mockResolvedValue(undefined);
  const queue = createTerminalInputQueue({ send, onActivity: jest.fn(), onError: jest.fn() });
  const paste = 'a'.repeat(8191) + '😀' + '界'.repeat(9000);
  queue.push('session', paste);
  await jest.advanceTimersByTimeAsync(8);
  const chunks = send.mock.calls.map(call => call[1] as string);
  expect(chunks.join('')).toBe(paste);
  expect(chunks.every(chunk => chunk.length <= 8192 && !/[\uD800-\uDBFF]$/.test(chunk))).toBe(true);
  queue.dispose();
});
