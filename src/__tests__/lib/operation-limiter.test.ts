/** @jest-environment node */

import {
  acquireOperationLimit,
  operationLimitResponse,
  resetOperationLimitsForTests,
} from '@/app/lib/operation-limiter';

describe('operation limiter', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetOperationLimitsForTests();
    process.env.RATE_LIMIT_CHAT_REQUESTS = '2';
    process.env.RATE_LIMIT_CHAT_WINDOW_SECONDS = '10';
    process.env.CONCURRENCY_LIMIT_CHAT = '2';
    process.env.RATE_LIMIT_MODEL_DOWNLOAD_REQUESTS = '2';
    process.env.RATE_LIMIT_MODEL_DOWNLOAD_WINDOW_SECONDS = '60';
    process.env.CONCURRENCY_LIMIT_MODEL_DOWNLOAD = '1';
  });

  afterAll(() => {
    process.env = originalEnv;
    resetOperationLimitsForTests();
  });

  it('enforces a request window and exposes retry metadata', async () => {
    const first = acquireOperationLimit('chat', 'user-a', 1_000);
    expect(first.allowed).toBe(true);
    if (first.allowed) first.lease.release();

    const second = acquireOperationLimit('chat', 'user-a', 2_000);
    expect(second.allowed).toBe(true);
    if (second.allowed) second.lease.release();

    const denied = acquireOperationLimit('chat', 'user-a', 3_000);
    expect(denied).toMatchObject({
      allowed: false,
      reason: 'rate',
      retryAfterSeconds: 8,
    });
    if (denied.allowed) throw new Error('Expected rate limit rejection');

    const response = operationLimitResponse(denied);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('8');
    expect(await response.json()).toEqual({
      error: 'Rate limit exceeded',
      retryAfterSeconds: 8,
    });
  });

  it('allows requests again after the window expires', () => {
    const first = acquireOperationLimit('chat', 'user-a', 1_000);
    const second = acquireOperationLimit('chat', 'user-a', 2_000);
    if (first.allowed) first.lease.release();
    if (second.allowed) second.lease.release();

    expect(acquireOperationLimit('chat', 'user-a', 11_001).allowed).toBe(true);
  });

  it('enforces concurrency and releases leases idempotently', () => {
    process.env.RATE_LIMIT_CHAT_REQUESTS = '3';
    const first = acquireOperationLimit('chat', 'user-a', 1_000);
    const second = acquireOperationLimit('chat', 'user-a', 1_001);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);

    const denied = acquireOperationLimit('chat', 'user-a', 1_002);
    expect(denied).toMatchObject({
      allowed: false,
      reason: 'concurrency',
      retryAfterSeconds: 5,
    });

    if (!first.allowed) throw new Error('Expected first lease');
    first.lease.release();
    first.lease.release();

    expect(acquireOperationLimit('chat', 'user-a', 1_003).allowed).toBe(true);
    if (second.allowed) second.lease.release();
  });

  it('isolates per-user limits', () => {
    const first = acquireOperationLimit('chat', 'user-a', 1_000);
    const second = acquireOperationLimit('chat', 'user-a', 1_001);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);

    expect(acquireOperationLimit('chat', 'user-b', 1_002).allowed).toBe(true);
  });

  it('uses a global concurrency scope for model downloads', () => {
    const first = acquireOperationLimit('model-download', 'admin-a', 1_000);
    expect(first.allowed).toBe(true);

    const denied = acquireOperationLimit('model-download', 'admin-b', 1_001);
    expect(denied).toMatchObject({
      allowed: false,
      reason: 'concurrency',
    });

    if (first.allowed) first.lease.release();
    expect(acquireOperationLimit('model-download', 'admin-b', 1_002).allowed).toBe(true);
  });
});
