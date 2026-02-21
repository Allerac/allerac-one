# Allerac Executor

Minimal Node.js HTTP service that executes shell commands on behalf of the AI agent. It enables the agent to run arbitrary shell commands inside a sandboxed Docker environment, including self-update operations via Docker CLI.

## How it works

The executor exposes a single endpoint (`POST /execute`) that receives a shell command, runs it using `/bin/bash`, and returns stdout, stderr, exit code, and execution time.

```
AI Agent (app / telegram-bot)
        │
        │  POST /execute
        │  X-Executor-Secret: <secret>
        ▼
   [Executor :3001]
        │
        │  child_process.exec (bash)
        ▼
   Shell command output
        │
        ▼
   JSON response → Agent
```

## API

### `GET /health`
Health check. Returns `{"status":"ok"}` with HTTP 200.

### `POST /execute`

**Headers:**
```
Content-Type: application/json
X-Executor-Secret: <EXECUTOR_SECRET>   ← required if secret is configured
```

**Request body:**
```json
{
  "command": "echo hello world",
  "cwd": "/workspace",       // optional, defaults to DEFAULT_CWD
  "timeout": 10000           // optional, milliseconds, defaults to 30000
}
```

**Response:**
```json
{
  "stdout": "hello world",
  "stderr": "",
  "exitCode": 0,
  "success": true,
  "command": "echo hello world",
  "duration_ms": 4
}
```

**Error responses:**
- `401` — missing or invalid `X-Executor-Secret`
- `400` — invalid JSON or missing `command` field
- `404` — unknown route

## Configuration (environment variables)

| Variable | Default | Description |
|---|---|---|
| `EXECUTOR_SECRET` | _(empty)_ | Shared secret for `X-Executor-Secret` header. Auth is disabled if empty. |
| `EXECUTOR_PORT` | `3001` | Port the server listens on |
| `DEFAULT_CWD` | `/tmp` | Default working directory for commands |

## Available tools inside the container

The Docker image includes the following tools for the agent to use:

| Tool | Purpose |
|---|---|
| `bash` | Shell interpreter |
| `curl` | HTTP requests |
| `git` | Repository operations |
| `docker` (CLI) | Self-update: run `docker compose build/up` on the host |

The Docker socket (`/var/run/docker.sock`) and the project directory are mounted at runtime, enabling self-update workflows via `update.sh`.

## Security

The executor runs arbitrary shell commands — it is the highest-privilege service in the stack. Its security model relies on two controls working together: **authentication** and **network isolation**. If either fails, the impact is full remote code execution on the host.

### Threat model

| Threat | Likelihood | Impact | Mitigated by |
|---|---|---|---|
| Unauthenticated access from Docker network | High if secret unset | Critical — full RCE | `EXECUTOR_SECRET` |
| Compromised internal container (SSRF/pivot) | Low | Critical — full RCE | Secret + network policy |
| Slow-body DoS (Slowloris) | Low | Medium — service hang | `headersTimeout` / `requestTimeout` |
| Memory exhaustion via large body | Low | Medium — OOM kill | 1 MB body limit |
| Runaway process via large timeout | Low | Low — resource drain | Timeout capped at 5 min |
| Log leakage of sensitive data | Medium | Low–Medium | Avoid secrets in commands |
| Docker socket privilege escalation | Low | Critical — host root | Intentional; restrict callers |

---

### Authentication

**`EXECUTOR_SECRET` must always be set in production.** If the variable is empty, the server accepts all requests with no authentication.

Generate a strong secret:
```bash
openssl rand -hex 32
```

Add it to `.env`:
```
EXECUTOR_SECRET=<generated-value>
```

Verify auth is active — the startup log must show:
```
[executor] Auth: enabled
```

If it shows `Auth: disabled`, the service is fully open to anyone on the Docker network.

---

### Network isolation

The executor has **no public port** in `docker-compose.yml`. It is only reachable by other containers on the internal Docker network (`allerac-one_default`).

**Never add a `ports:` mapping for the executor** — doing so would expose arbitrary shell execution to the internet.

To verify no public port is bound:
```bash
docker port allerac-executor
# should return nothing
```

---

### Docker socket

The Docker socket (`/var/run/docker.sock`) is mounted into the container to enable self-update (`docker compose build/up`). This is equivalent to **root access on the host** — any command that can reach the executor can escalate to host root via Docker.

Consequences:
- Keep the `EXECUTOR_SECRET` strong and rotated
- Limit which services can call the executor (currently: `app`, `telegram-bot`, `notifier`)
- Do not add new callers without reviewing their attack surface

---

### Input limits

The following limits are enforced in `server.js`:

| Limit | Value | Protects against |
|---|---|---|
| Body size | 1 MB | Memory exhaustion |
| `timeout` min | 1,000 ms | Trivially short commands |
| `timeout` max | 300,000 ms (5 min) | Runaway processes |
| Headers timeout | 10,000 ms | Slowloris (header phase) |
| Request timeout | 30,000 ms | Slowloris (body phase) |

---

### Log hygiene

All commands are logged to stdout (and shipped to Loki via Promtail):
```
[executor] Running: <command>
```

**Never pass secrets, tokens, or passwords as part of a shell command argument.** Use environment variables or files instead. Anything in the command string will appear in logs.

---

### Checklist for production

- [ ] `EXECUTOR_SECRET` is set to a strong random value in `.env`
- [ ] No `ports:` mapping exists for the executor in `docker-compose.yml`
- [ ] Startup log shows `Auth: enabled`
- [ ] Memory limit is set (`deploy.resources.limits.memory: 256M` in compose)
- [ ] Commands sent to the executor do not include secrets in plaintext

## File structure

```
infra/executor/
├── server.js    # HTTP server — single file, no dependencies
└── Dockerfile
```
