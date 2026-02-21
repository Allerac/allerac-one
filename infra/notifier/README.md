# Allerac Notifier

Go service responsible for scheduling recurring prompts, executing them via LLM, and delivering the results to configured channels (Telegram, and in the future browser, email, etc.).

## Architecture

```
PostgreSQL (scheduled_jobs)
        │
        │  cron trigger
        ▼
   [Scheduler]  ──── loads jobs from DB on startup
        │
        │  runner.Run (with retry)
        ▼
    [Runner]  ──── calls Ollama / OpenAI-compatible LLM
        │
        │  publisher.Publish
        ▼
  Redis Stream "notifications"
        │
        ├── consumer group: telegram-group ──► [Telegram Consumer]  ──► Telegram Bot API
        ├── consumer group: browser-group  ──► (future)
        └── consumer group: email-group    ──► (future)

  On failure after maxDeliveryAttempts:
        └──► Redis Stream "notifications:dead"  (Dead Letter Queue)
```

### Packages

| Package | Responsibility |
|---|---|
| `internal/config` | Reads configuration from environment variables |
| `internal/db` | PostgreSQL connection via pgxpool |
| `internal/runner` | Executes prompts via the Ollama API (`/api/chat`) |
| `internal/publisher` | Publishes notifications to the Redis Stream |
| `internal/scheduler` | Reads `scheduled_jobs` from DB, registers crons, calls runner + publisher |
| `internal/consumers/telegram` | Redis Stream consumer group → Telegram Bot API |

---

## Pipeline in detail

### 1. Scheduler
- On startup, loads all `scheduled_jobs` with `enabled = true` from PostgreSQL
- Registers each job in the cron (`robfig/cron`) using its configured expression
- When the cron fires, calls `ExecuteJob`

### 2. Runner (with retry)
- Calls `POST /api/chat` on Ollama with the job prompt
- On failure, retries up to **3 times** with multiplicative backoff:
  - Attempt 1 fails → waits `1 × retryDelay` (default: 5s)
  - Attempt 2 fails → waits `2 × retryDelay` (default: 10s)
  - Attempt 3 fails → job marked as `failed` in the DB
- The result is saved in `job_executions`

### 3. Publisher
- Publishes the result to the Redis Stream `notifications` with the fields:
  - `job_id`, `user_id`, `channel`, `content`
- Each channel configured in the job receives an independent message

### 4. Consumers (Telegram)
- Uses Redis Streams **consumer groups**: each group reads the same event independently
- Delivery flow with DLQ:
  1. Read message (`XREADGROUP`)
  2. Increment attempt counter (`INCR notifications:attempts:{msg_id}`)
  3. Try to deliver via `ProcessMessage`
  4. **Success** → XACK + delete counter
  5. **Failure** → no XACK (message stays in PEL)
- Every **1 minute**, `reclaimLoop` runs `XAUTOCLAIM` to recover messages stuck in the PEL for more than 5 minutes
- After **3 failed attempts** → message is moved to the **Dead Letter Queue** (`notifications:dead`) with diagnostic metadata

### 5. Dead Letter Queue (DLQ)
Redis Stream: `notifications:dead`

Original payload fields preserved, plus additional metadata:
- `dlq_reason` — reason for failure
- `dlq_original_id` — original ID in the `notifications` stream
- `dlq_consumer_group` — consumer group that failed
- `dlq_timestamp` — timestamp when the message was moved to the DLQ

To inspect the DLQ:
```bash
docker exec allerac-redis redis-cli XRANGE notifications:dead - + COUNT 10
```

---

## Adding a new consumer

1. Create the package:
```
infra/notifier/internal/consumers/email/consumer.go
```

2. Register your consumer group on the Redis Stream (`publisher.StreamName`) with a unique group name:
```go
const consumerGroup = "email-group"
```

3. Implement `Start(ctx)` and `ProcessMessage(ctx, msg)` following the Telegram consumer pattern

4. Register it in `cmd/notifier/main.go`:
```go
emailConsumer, _ := email.New(cfg.RedisURL, cfg.SMTPConfig)
emailConsumer.Start(ctx)
```

The same event will be received independently by each consumer group.

---

## Configuration (environment variables)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/allerac` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama endpoint (or any compatible API) |
| `NOTIFIER_LLM_MODEL` | `qwen2.5:3b` | LLM model to use |
| `TELEGRAM_BOT_TOKEN` | _(required for Telegram)_ | Telegram bot token |

---

## Database

### `scheduled_jobs`
```sql
id          UUID PRIMARY KEY
user_id     UUID  -- references users(id)
name        TEXT  -- human-readable job name
cron_expr   TEXT  -- e.g. "0 8 * * *" (every day at 8am)
prompt      TEXT  -- prompt sent to the LLM
channels    TEXT[] -- e.g. {"telegram", "browser"}
enabled     BOOLEAN
last_run_at TIMESTAMPTZ
```

### `job_executions`
Execution history:
```sql
id           UUID PRIMARY KEY
job_id       UUID
status       TEXT  -- running | completed | failed
result       TEXT  -- LLM response (or error message on failure)
started_at   TIMESTAMPTZ
completed_at TIMESTAMPTZ
```

### Example: create a daily "Hello World" job
```sql
INSERT INTO scheduled_jobs (user_id, name, cron_expr, prompt, channels)
VALUES (
  '<user-uuid>',
  'Hello World Daily',
  '0 8 * * *',
  'Say a friendly hello world greeting',
  ARRAY['telegram']
);
```

---

## Running the tests

### Unit tests (no external dependencies)
```bash
go test ./internal/... -v
```

### E2E test (requires PostgreSQL and Redis running)
```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/allerac \
TEST_REDIS_URL=redis://localhost:6379 \
go test -tags e2e ./tests/e2e/... -v
```

The E2E test (`TestHelloWorldScheduledJob`) validates the full pipeline:
- Creates a "Hello World Daily" job in the database
- Executes it via the Scheduler (with a mocked Ollama)
- Verifies the notification in the Redis Stream
- Verifies the record in `job_executions`
- Verifies delivery via the Telegram consumer (with a mocked API)

---

## File structure

```
infra/notifier/
├── cmd/notifier/
│   └── main.go                        # Entry point
├── internal/
│   ├── config/config.go               # Configuration
│   ├── db/db.go                       # PostgreSQL connection
│   ├── runner/
│   │   ├── runner.go                  # LLM prompt execution
│   │   └── runner_test.go
│   ├── publisher/
│   │   ├── publisher.go               # Redis Stream publisher
│   │   └── publisher_test.go
│   ├── scheduler/
│   │   ├── scheduler.go               # Cron + retry
│   │   └── scheduler_test.go
│   └── consumers/
│       └── telegram/
│           ├── consumer.go            # Consumer group + DLQ
│           └── consumer_test.go
├── tests/e2e/
│   └── hello_world_test.go            # Full E2E test
├── Dockerfile
├── go.mod
└── README.md
```
