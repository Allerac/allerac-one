# Distributed Rate Limiting

## Purpose

Allerac One limits expensive operations to reduce abuse, accidental overload, provider costs, and resource exhaustion.

The protected operations currently include:

| Operation | Request limit | Concurrency limit | Scope |
|---|---:|---:|---|
| Chat and LLM requests | 30 per minute | 2 active | Per user |
| Benchmarks | 5 per 10 minutes | 1 active | Per user |
| Image editing | 10 per 10 minutes | 1 active | Per user |
| Model downloads | 3 per hour | 1 active | Global |

The defaults are configurable through environment variables.

## Current Implementation

The limiter in `src/app/lib/operation-limiter.ts` stores request timestamps and active-operation counters in the Node.js process memory.

This is appropriate for the current single-instance deployment:

- All requests use the same limiter state.
- Checks and counter updates are synchronous within one process.
- No external service is required.
- Active leases can be released reliably in `finally` blocks.

The application returns HTTP `429 Too Many Requests` with `Retry-After` and rate-limit metadata when a request is rejected.

## Limitations

### Process Restarts

All counters are lost when the application restarts or is redeployed. A user who exhausted a request window can immediately retry after a restart.

Active-operation counters are also lost. This does not stop an operation already running outside the restarted process, such as a model download initiated in Ollama.

### Multiple Instances

Each application instance has an independent limiter store.

With three replicas, a per-user limit of 30 requests per minute may effectively permit up to 90 requests per minute if traffic is distributed across all replicas.

Global concurrency limits also stop being global. Two replicas could start two model downloads even though the configured limit is one.

Sticky sessions reduce this problem but do not solve it:

- Users can be reassigned after failures or deployments.
- Global limits still require shared state.
- Background and internal requests may use different instances.

### Serverless and Autoscaling Environments

In serverless environments, instances can be created or destroyed frequently. In-memory counters may be isolated per invocation environment and cannot provide a dependable security boundary.

## Required Shared-State Design

Before running multiple application instances, the limiter must use a shared backend that supports atomic updates.

The backend must provide:

1. Atomic request-window checks and increments.
2. Atomic concurrency acquisition.
3. Lease expiration for crashed or terminated workers.
4. Idempotent lease release.
5. Per-user and global scopes.
6. Accurate retry timing.
7. Bounded storage growth.

The existing route and action integrations should continue using the same high-level contract:

```typescript
const result = await acquireOperationLimit('chat', user.id);

if (!result.allowed) {
  return operationLimitResponse(result);
}

try {
  return await performOperation();
} finally {
  await result.lease.release();
}
```

The implementation may become asynchronous, but callers should not need to understand the storage backend.

## Backend Options

### Redis

Redis is the preferred option for deployments that already operate or can adopt it.

Advantages:

- Atomic Lua scripts or transactions.
- Native key expiration.
- Efficient counters and sorted sets.
- Low latency under high request volume.
- Straightforward distributed concurrency leases.

Disadvantages:

- Adds another production dependency.
- Requires authentication, TLS, persistence policy, monitoring, and backup decisions.
- Availability of the limiter becomes tied to Redis availability.

Suggested key structure:

```text
allerac:limit:{operation}:{scope}:requests
allerac:limit:{operation}:{scope}:leases
```

Request windows can use a sorted set containing request timestamps. Concurrency leases can use a hash or sorted set containing lease IDs and expiration times.

Acquisition must happen atomically in one Lua script:

1. Remove expired requests and leases.
2. Check the request count.
3. Check active leases.
4. Add the request timestamp and lease ID.
5. Set or refresh key expiration.
6. Return remaining capacity and retry timing.

### PostgreSQL

PostgreSQL is appropriate when avoiding another infrastructure dependency is more important than minimizing limiter latency.

Advantages:

- Already required by Allerac One.
- Transactional and durable.
- Supports row locking and advisory locks.
- Easier operational model for small deployments.

Disadvantages:

- More database load for every protected request.
- Cleanup and lease expiry require careful design.
- High-frequency chat traffic may cause contention.
- Sliding-window implementations are less efficient than Redis.

A PostgreSQL implementation should use transactions with row-level locking or advisory locks. A simple read followed by an update is not sufficient because concurrent instances can both pass the check.

## Lease Expiration

Distributed concurrency slots must have a maximum lifetime.

Without expiration, a process crash after acquisition can permanently consume a slot. Each operation should therefore have a lease TTL based on its expected maximum duration.

Suggested starting values:

| Operation | Lease TTL |
|---|---:|
| Chat | 15 minutes |
| Benchmark | 30 minutes |
| Image editing | 10 minutes |
| Model download | 2 hours |

Long-running operations should renew their leases periodically. Release must remain idempotent so duplicate cleanup does not decrement concurrency below zero.

## Failure Policy

The shared limiter needs an explicit policy for backend outages.

Recommended behavior:

- **Model downloads:** fail closed. Do not start an uncoordinated global operation.
- **Benchmarks and image editing:** fail closed because they are expensive and non-essential.
- **Chat:** fail closed by default, with an optional tightly bounded local emergency fallback only if product availability requires it.

Limiter failures must return a generic `503 Service Unavailable`. Internal backend details must not be exposed to clients.

## Security Requirements

- Derive user identity from the authenticated session.
- Never accept the rate-limit subject from request bodies or client parameters.
- Use a separate global scope for model downloads.
- Do not include API tokens, prompts, image data, or other sensitive content in limiter keys.
- Add a deployment-specific prefix so staging and production do not share counters.
- Protect Redis or PostgreSQL credentials as production secrets.
- Log rejected operations without logging sensitive request payloads.

## Observability

The distributed implementation should expose:

- Allowed and rejected request counts by operation.
- Rejection reason: request rate or concurrency.
- Current active lease count.
- Lease expirations and forced cleanup.
- Backend latency and errors.
- Number of requests using any emergency fallback.

Metrics must not use raw user IDs as high-cardinality labels. User IDs may appear in restricted structured logs when required for abuse investigation.

## Migration Plan

1. Introduce a storage-independent limiter interface.
2. Keep the current in-memory implementation as the single-instance adapter.
3. Add Redis or PostgreSQL integration tests for atomic acquisition and release.
4. Add lease IDs and TTLs.
5. Add backend health and metrics.
6. Deploy the shared backend while still running one application instance.
7. Run concurrency tests from separate processes.
8. Enable multiple application replicas only after distributed tests pass.

## Acceptance Criteria

The application is ready for horizontal scaling when:

- Two separate Node.js processes observe the same request limits.
- A concurrency slot acquired by one process blocks acquisition in another.
- Expired leases are recovered after a process is terminated.
- Releasing a lease more than once is harmless.
- Request windows reset at the expected time.
- Per-user limits remain isolated.
- Global model-download limits apply across all replicas.
- Backend outages follow the documented failure policy.
- Load tests show acceptable limiter latency and database or Redis utilization.

## Deployment Rule

Do not run multiple Allerac One application replicas while the in-memory limiter is the only enforcement mechanism.

The current implementation is valid for one application instance. Horizontal scaling requires a shared limiter backend first.
