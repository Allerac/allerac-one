export type ExpensiveOperation =
  | 'chat'
  | 'public-chat'
  | 'benchmark'
  | 'image-edit'
  | 'model-download';

interface OperationLimit {
  requests: number;
  windowMs: number;
  concurrency: number;
  scope: 'user' | 'global';
}

interface LimiterEntry {
  active: number;
  requests: number[];
}

interface LimiterStore {
  entries: Map<string, LimiterEntry>;
}

export interface OperationLease {
  release(): void;
}

export type OperationLimitResult =
  | {
      allowed: true;
      lease: OperationLease;
      headers: Record<string, string>;
    }
  | {
      allowed: false;
      reason: 'rate' | 'concurrency';
      retryAfterSeconds: number;
      headers: Record<string, string>;
    };

declare global {
  var __alleracOperationLimiterStore: LimiterStore | undefined;
}

const store = globalThis.__alleracOperationLimiterStore ?? { entries: new Map() };
globalThis.__alleracOperationLimiterStore = store;

function positiveInteger(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function getLimit(operation: ExpensiveOperation): OperationLimit {
  switch (operation) {
    case 'chat':
      return {
        requests: positiveInteger('RATE_LIMIT_CHAT_REQUESTS', 30),
        windowMs: positiveInteger('RATE_LIMIT_CHAT_WINDOW_SECONDS', 60) * 1_000,
        concurrency: positiveInteger('CONCURRENCY_LIMIT_CHAT', 2),
        scope: 'user',
      };
    // Extra daily budget cap stacked on top of 'chat' for public-facing domains
    // (see PUBLIC_DOMAINS in chat-tool-registry.ts). Every website visitor shares
    // the same service account, so 'chat's per-minute window alone doesn't stop
    // sustained abuse (VPN/IP rotation) from running up real LLM spend over a day.
    // Concurrency is set high — this is a volume cap, not a concurrency cap;
    // 'chat' already enforces concurrency for this account.
    case 'public-chat':
      return {
        requests: positiveInteger('RATE_LIMIT_PUBLIC_CHAT_REQUESTS', 300),
        windowMs: positiveInteger('RATE_LIMIT_PUBLIC_CHAT_WINDOW_SECONDS', 86_400) * 1_000,
        concurrency: positiveInteger('CONCURRENCY_LIMIT_PUBLIC_CHAT', 20),
        scope: 'user',
      };
    case 'benchmark':
      return {
        requests: positiveInteger('RATE_LIMIT_BENCHMARK_REQUESTS', 5),
        windowMs: positiveInteger('RATE_LIMIT_BENCHMARK_WINDOW_SECONDS', 600) * 1_000,
        concurrency: positiveInteger('CONCURRENCY_LIMIT_BENCHMARK', 1),
        scope: 'user',
      };
    case 'image-edit':
      return {
        requests: positiveInteger('RATE_LIMIT_IMAGE_EDIT_REQUESTS', 10),
        windowMs: positiveInteger('RATE_LIMIT_IMAGE_EDIT_WINDOW_SECONDS', 600) * 1_000,
        concurrency: positiveInteger('CONCURRENCY_LIMIT_IMAGE_EDIT', 1),
        scope: 'user',
      };
    case 'model-download':
      return {
        requests: positiveInteger('RATE_LIMIT_MODEL_DOWNLOAD_REQUESTS', 3),
        windowMs: positiveInteger('RATE_LIMIT_MODEL_DOWNLOAD_WINDOW_SECONDS', 3_600) * 1_000,
        concurrency: positiveInteger('CONCURRENCY_LIMIT_MODEL_DOWNLOAD', 1),
        scope: 'global',
      };
  }
}

function limitHeaders(
  limit: OperationLimit,
  remaining: number,
  resetSeconds: number,
): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(limit.requests),
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
    'X-RateLimit-Reset': String(Math.max(1, resetSeconds)),
  };
}

export interface OperationLimitOverride {
  requests?: number;
  windowMs?: number;
}

function applyOverride(limit: OperationLimit, override?: OperationLimitOverride): OperationLimit {
  if (!override) return limit;
  return {
    ...limit,
    requests: override.requests ?? limit.requests,
    windowMs: override.windowMs ?? limit.windowMs,
  };
}

export function acquireOperationLimit(
  operation: ExpensiveOperation,
  userId: string,
  now = Date.now(),
  override?: OperationLimitOverride,
): OperationLimitResult {
  const limit = applyOverride(getLimit(operation), override);
  const subject = limit.scope === 'global' ? 'global' : userId;
  const key = `${operation}:${subject}`;
  const entry: LimiterEntry = store.entries.get(key) ?? { active: 0, requests: [] };
  const windowStart = now - limit.windowMs;
  entry.requests = entry.requests.filter(timestamp => timestamp > windowStart);

  const resetSeconds = entry.requests.length > 0
    ? Math.ceil((entry.requests[0] + limit.windowMs - now) / 1_000)
    : Math.ceil(limit.windowMs / 1_000);

  if (entry.active >= limit.concurrency) {
    store.entries.set(key, entry);
    return {
      allowed: false,
      reason: 'concurrency',
      retryAfterSeconds: 5,
      headers: {
        ...limitHeaders(limit, limit.requests - entry.requests.length, resetSeconds),
        'Retry-After': '5',
      },
    };
  }

  if (entry.requests.length >= limit.requests) {
    const retryAfterSeconds = Math.max(1, resetSeconds);
    store.entries.set(key, entry);
    return {
      allowed: false,
      reason: 'rate',
      retryAfterSeconds,
      headers: {
        ...limitHeaders(limit, 0, retryAfterSeconds),
        'Retry-After': String(retryAfterSeconds),
      },
    };
  }

  entry.requests.push(now);
  entry.active += 1;
  store.entries.set(key, entry);
  let released = false;

  return {
    allowed: true,
    headers: limitHeaders(
      limit,
      limit.requests - entry.requests.length,
      Math.ceil(limit.windowMs / 1_000),
    ),
    lease: {
      release() {
        if (released) return;
        released = true;
        const current = store.entries.get(key);
        if (!current) return;
        current.active = Math.max(0, current.active - 1);
        if (current.active === 0 && current.requests.length === 0) {
          store.entries.delete(key);
        }
      },
    },
  };
}

export interface OperationLimitStatus {
  used: number;
  limit: number;
  windowSeconds: number;
  resetSeconds: number;
}

/**
 * Read-only view of current usage for the window — does not consume a slot or
 * mutate the store. Used to power usage indicators (e.g. the per-domain rate
 * limit panel) without affecting the actual limiter state.
 */
export function peekOperationLimit(
  operation: ExpensiveOperation,
  userId: string,
  override?: OperationLimitOverride,
  now = Date.now(),
): OperationLimitStatus {
  const limit = applyOverride(getLimit(operation), override);
  const subject = limit.scope === 'global' ? 'global' : userId;
  const key = `${operation}:${subject}`;
  const entry = store.entries.get(key);
  const windowStart = now - limit.windowMs;
  const requests: number[] = entry ? entry.requests.filter((timestamp: number) => timestamp > windowStart) : [];
  const resetSeconds = requests.length > 0
    ? Math.ceil((requests[0] + limit.windowMs - now) / 1_000)
    : 0;

  return {
    used: requests.length,
    limit: limit.requests,
    windowSeconds: Math.ceil(limit.windowMs / 1_000),
    resetSeconds,
  };
}

export function operationLimitResponse(result: Extract<OperationLimitResult, { allowed: false }>): Response {
  const error = result.reason === 'concurrency'
    ? 'Too many concurrent operations'
    : 'Rate limit exceeded';
  return Response.json(
    { error, retryAfterSeconds: result.retryAfterSeconds },
    { status: 429, headers: result.headers },
  );
}

export function resetOperationLimitsForTests(): void {
  store.entries.clear();
}
