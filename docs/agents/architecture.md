# Agent Background Execution Architecture

## Overview

This document describes the architecture for managing parallel agent execution in Allerac One. The system follows the **Orchestrator + Workers** pattern with a **Postgres-backed job queue** for durable background execution.

> **Runtime update (2026-07-14):** the worker process described below no longer runs
> inside the Next.js app. It runs in the dedicated `agent-worker` container
> (`Dockerfile.agent-worker`, entry `src/agent-worker.ts`), which uses the same
> `WorkerRunnerService` and Postgres queue unchanged. The app sets
> `DISABLE_AGENT_RUNNER=true`. See
> [Control API architecture, Phase 4](../architecture/control-api-v1.md).

## Problem Statement

The initial implementation used `Promise.all()` within the HTTP handler with SSE streaming to the client. This approach failed in production because:

- **SSE buffering**: Docker, proxies, and the Next.js dev server buffer stream output, delivering all events at once after the stream closes
- **HTTP timeouts**: Long-running agent executions (2-5 minutes) exceed typical HTTP timeout limits
- **No fault tolerance**: Process restart loses all in-flight execution state
- **UI frozen**: Client shows "Planning..." indefinitely until the entire run completes

## Architecture

### Core Pattern

```
POST /api/agents → INSERT pending → return runId (instant)
     ↓
Worker loop → SELECT pending (FOR UPDATE SKIP LOCKED) → execute → UPDATE status
     ↓
GET /api/agents/:runId → return current state → client polls every 2s
```

Three components, single source of truth (Postgres):

| Component | Role | DB Operations |
|---|---|---|
| **API route** | Create run, return immediately | `INSERT` only |
| **Worker process** | Execute orchestrator + workers | `SELECT ... FOR UPDATE SKIP LOCKED` + `UPDATE` |
| **Status endpoint** | Return current state for UI | `SELECT` only |

### Why Postgres as Queue

We already run Postgres and have the `agent_runs` and `agent_workers` tables. Using Postgres as the job queue:

- **Zero new dependencies** — no Redis, RabbitMQ, or Celery required
- **Atomic operations** — `FOR UPDATE SKIP LOCKED` prevents duplicate job processing
- **Durable by default** — state persists across process restarts
- **Single source of truth** — no state duplication between queue and result storage
- **Scales adequately** — handles thousands of queued jobs without issue

Redis would only add value for pubsub (replacing polling), but polling is more reliable in our Docker/proxy environment.

## Database Schema

### Existing Tables (minimal changes)

**agent_runs**
```sql
id UUID PRIMARY KEY
conversation_id UUID REFERENCES chat_conversations(id)
user_id UUID REFERENCES users(id)
status VARCHAR(20) -- 'pending' | 'planning' | 'running' | 'aggregating' | 'completed' | 'failed'
prompt TEXT
plan JSONB
result TEXT
error_message TEXT    -- NEW: stores failure reason
started_at TIMESTAMPTZ
completed_at TIMESTAMPTZ
```

**agent_workers**
```sql
id UUID PRIMARY KEY
run_id UUID REFERENCES agent_runs(id)
name VARCHAR(100)
task TEXT
skill_id UUID REFERENCES skills(id)
status VARCHAR(20) -- 'waiting' | 'running' | 'completed' | 'failed'
result TEXT
tokens_used INT
started_at TIMESTAMPTZ
completed_at TIMESTAMPTZ
```

### Migration Required

Add `error_message` column to `agent_runs` for failed run details.

## Implementation Plan

### Phase 1 — Decouple API from Execution

**Goal:** `POST /api/agents` returns in <100ms, no blocking.

**Changes to `src/app/api/agents/route.ts`:**
1. Authenticate user, load settings, create conversation (same as before)
2. Insert `agent_runs` with `status='pending'`
3. Return `{ runId }` immediately
4. Remove all `Promise.all()`, SSE streaming, orchestrator/worker execution logic

**New response:**
```json
{ "runId": "uuid" }
```

### Phase 2 — Worker Process

**Goal:** Background process that picks up pending runs and executes them.

**Location:** `src/app/services/agents/worker-runner.service.ts` (new)

**Responsibilities:**
1. Poll `agent_runs` for `status='pending'` every 2-5 seconds
2. `SELECT ... FOR UPDATE SKIP LOCKED` to claim jobs atomically
3. Update status to `planning` → execute orchestrator plan → update workers
4. Update status to `running` → execute workers in parallel → update each worker
5. Update status to `aggregating` → aggregate results → update final result
6. On success: `status='completed'`
7. On failure: `status='failed'`, store `error_message`

**Concurrency control:**
- `FOR UPDATE SKIP LOCKED` ensures only one worker process handles each run
- Max concurrent runs configurable (default: 5)
- Each run's workers still execute in parallel via `Promise.all()`

**Resilience:**
- Stale `running` runs (no heartbeat for >5 min) are retried
- Failed workers don't fail the entire run — marked as `failed`, run continues with available results
- Database errors logged, run marked `failed` with error message

### Phase 3 — Client Polling

**Goal:** Real-time UI updates via polling instead of broken SSE.

**New endpoint:** `GET /api/agents/:runId`

**Response:**
```json
{
  "runId": "uuid",
  "status": "running",
  "plan": { "taskBreakdown": "...", "workers": [...] },
  "workers": [
    { "id": "...", "name": "...", "task": "...", "status": "completed", "result": "..." },
    { "id": "...", "name": "...", "task": "...", "status": "running" }
  ],
  "result": null,
  "error": null
}
```

**New hook:** `useAgentRunPoll(runId, options)` replaces `useAgentRun` SSE reader
- Polls `GET /api/agents/:runId` every 2 seconds
- Translates DB state into `AgentRunState` interface (compatible with existing UI)
- Stops polling on `completed` or `failed` status
- Handles network errors gracefully (continues polling)

### Phase 4 — UI Integration

**Goal:** `AgentRunView` receives live state updates from polling.

**Already done (partially):**
- `ChatClient` → `ChatMessages` → `AgentRunView` prop chain established
- `AgentRunView` accepts `state` prop (no longer hardcoded)

**Remaining:**
- Replace `useAgentRun` hook with `useAgentRunPoll` in `ChatClient.tsx`
- Wire polling state into existing message injection flow
- Ensure `AgentRunView` transitions correctly through all statuses

### Phase 5 — Cleanup

**Goal:** Remove dead code and finalize.

- Remove SSE streaming code from old route
- Remove unused `useAgentRun` SSE reader (keep interface for compatibility)
- Update `agents-implementation.md` to reflect new architecture
- Add polling to UI testing checklist

## User Flow

1. User clicks **Agents** toggle in ChatInput
2. User types message → Send
3. `POST /api/agents` → returns `{ runId }` in <100ms
4. Input unlocks immediately — user can type while agents work
5. Background worker picks up the pending run
6. Client polls `GET /api/agents/:runId` every 2s
7. `AgentRunView` updates live:
   - `pending` → "Waiting to start..."
   - `planning` → "Orchestrator planning..."
   - `running` → Worker cards show individual progress
   - `aggregating` → "Synthesizing results..."
   - `completed` → Final result displayed
   - `failed` → Error message shown
8. Assistant message with agent result injected into conversation

## Failure Modes

| Failure | Behavior | Recovery |
|---|---|---|
| Process crashes during run | Status remains in DB (`running`) | Worker picks up stale runs on restart |
| Single worker fails | Worker marked `failed`, run continues | Aggregation handles missing results |
| All workers fail | Run marked `failed` | User can retry |
| DB unavailable | API returns error | Retry with user action |
| Client disconnects | Run continues in background | Polling resumes on reconnect |

## Performance Characteristics

- **API response time:** <100ms (just DB insert)
- **Worker poll interval:** 2-5 seconds
- **Client poll interval:** 2 seconds
- **Max concurrent runs:** 5 (configurable)
- **Worker timeout:** 60 seconds per worker
- **Stale run detection:** 5 minutes without progress
- **Database load:** ~2 queries/second per active poller (negligible at current scale)

## Future Considerations

### When to Scale Beyond This Architecture

- **>100 concurrent agent runs**: Consider Redis queue for higher throughput
- **Real-time push needed**: Add WebSocket layer on top of DB state
- **Multi-node deployment**: Use pg-boss for distributed worker coordination
- **Hours-long workflows**: Consider Temporal or similar durable execution platform

### Not Currently Needed

- Redis queue (adds state duplication)
- Durable execution framework (runs are 2-5 minutes, user can retry)
- Celery or similar (Python-based, wrong stack)
- Complex pubsub (polling is simpler and more reliable in our environment)
