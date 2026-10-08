# Allerac Executor

Minimal Node.js HTTP service that executes shell commands on behalf of the AI agent and the `/workspace` UI. It runs arbitrary bash, so it is the highest-privilege service in the stack and is locked down accordingly (see **Security**).

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
X-Executor-Secret: <EXECUTOR_SECRET>   ← always required
```

**Request body:**
```json
{
  "command": "echo hello world",
  "cwd": "/workspace/projects/<userId>",  // optional, defaults to DEFAULT_CWD
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
| `EXECUTOR_SECRET` | _(none — required)_ | Shared secret for the `X-Executor-Secret` header. **The server refuses to start** if it is missing or shorter than 32 characters. It is removed from the environment of executed commands. |
| `EXECUTOR_PORT` | `3001` | Port the server listens on (inside the Docker network only) |
| `DEFAULT_CWD` | `/workspace` (image) | Default working directory for commands |
| `HOME` | `/workspace/.home` (image) | Writable home (npm/pip caches) inside the workspace volume |

Compose-level settings (`docker-compose.yml` / `.env`):

| Variable | Default | Description |
|---|---|---|
| `EXECUTOR_WORKSPACE` | named volume `allerac_executor_workspace` | What is mounted at `/workspace`. May be set to an absolute host folder owned by uid `10001`. Never use `/home`, `/` or the Allerac install folder. |
| `EXECUTOR_DEV_PORTS_BIND` | `127.0.0.1` | Host interface for the workspace dev-server ports `3000`, `3002-3010`. |

## Available tools inside the container

| Tool | Purpose |
|---|---|
| `bash` | Shell interpreter |
| `node` / `npm` | JavaScript projects |
| `curl` | HTTP requests |
| `git` | Repository operations (system-level identity "Allerac User") |

There is **no** Docker CLI and **no** Docker socket in this container.

## Security

The executor runs arbitrary shell commands. The controls, from outermost to innermost:

1. **Who can reach it (app side).** Only administrators can use the shell by default: the `/api/workspace/*` routes, the `/workspace` pages, the `execute_shell` / `edit_file` chat tools (web chat, Control API, Telegram, scheduled jobs) and agent-run workers all check `src/app/lib/shell-access.ts`. Non-admins get `403` / a tool error and the tools are not offered to the model. Specific non-admin users can be allowed with `SHELL_ALLOWED_USER_IDS` (user UUIDs). If the role cannot be determined, access is denied.
2. **Who can create accounts.** Public sign-up is closed by default (`ALLOW_REGISTRATION=false`); see `src/app/lib/registration-policy.ts`.
3. **Authentication.** `EXECUTOR_SECRET` is mandatory (≥ 32 chars) and compared in constant time. The secret is not passed to executed commands. Note: a command running as the same uid can still read `/proc/1/environ`, so treat anyone with shell access as able to learn `EXECUTOR_SECRET` (another reason the shell is admin-only).
4. **Network.** Port `3001` is never published; only containers on the compose network reach it. The dev-server ports are published on `127.0.0.1` only by default.
5. **Container.**
   - runs as the unprivileged user `executor` (uid/gid `10001`), never root;
   - `cap_drop: [ALL]` and `no-new-privileges`;
   - read-only root filesystem; writable paths are only `/workspace` (volume) and `/tmp` (tmpfs, 128 MB);
   - memory limit 256 MB and `pids: 512`;
   - **no host mounts**: the host `/home`, the install folder (with `.env`) and the Docker socket are not mounted. No GitHub tokens in its environment.
6. **Command blocklist.** `server.js` still has a regex blocklist (`rm -rf`, `sudo`, `docker`, ...). It is **defense in depth only** and easy to bypass; do not rely on it.
7. **Working directory.** The app pins `cwd` to `/workspace/projects/<userId>`. This is a convenience boundary, not isolation: all users of the shell share one container and one uid, and a command can `cd` anywhere inside it.

### What is still not isolated

- All shell users share the same container and uid, so one shell user can read or modify another shell user's workspace. This is acceptable only because shell access is limited to administrators/trusted users.
- Commands can reach the network, including other services on the compose network (e.g. `db:5432`). Database credentials are not in the executor's environment, but the default `postgres/postgres` password is guessable — change `POSTGRES_PASSWORD`.
- Next step for real multi-tenant use: one sandbox per user (separate container or gVisor/Firecracker) and a separate network without database access.

### Input limits

| Limit | Value | Protects against |
|---|---|---|
| Body size | 1 MB | Memory exhaustion |
| `timeout` min | 1,000 ms | Trivially short commands |
| `timeout` max | 300,000 ms (5 min) | Runaway processes |
| Headers timeout | 10,000 ms | Slowloris (header phase) |
| Request timeout | 30,000 ms | Slowloris (body phase) |

### Log hygiene

All commands are logged to stdout (`[executor][<time>] cmd="..."`). **Never put secrets in a command string.**

### Checklist for production

- [ ] `EXECUTOR_SECRET` is a random value of at least 32 characters (`openssl rand -hex 32`)
- [ ] `ALLOW_REGISTRATION` is unset or `false` unless you really want open sign-up
- [ ] `SHELL_ALLOWED_USER_IDS` is empty or lists only trusted users
- [ ] `docker port allerac-executor` shows only `127.0.0.1:` bindings (or nothing)
- [ ] `docker exec allerac-executor id` shows `uid=10001(executor)`
- [ ] `EXECUTOR_WORKSPACE` is unset (named volume) or a dedicated folder — never `/home`

## Upgrading from the old setup (host `/home` mount)

Before this change the executor ran as root with `HOST_WORKSPACE` (default `/home`) mounted read-write at `/workspace`, the install folder at `/project` and `/home` read-only at `/home`. `HOST_WORKSPACE` is now ignored.

1. Rebuild the executor image: `docker compose build executor agent-worker app` (`update.sh` now does this).
2. Copy existing workspace projects into the new volume once (replace `/home` with your old `HOST_WORKSPACE` if different):

   ```bash
   docker compose up -d executor          # creates the volume allerac_executor_workspace
   docker run --rm \
     -v /home/projects:/from:ro \
     -v allerac_executor_workspace:/to \
     alpine sh -c 'mkdir -p /to/projects && cp -a /from/. /to/projects/ && chown -R 10001:10001 /to'
   ```

3. If you prefer a host folder: `sudo mkdir -p /srv/allerac-workspace/projects && sudo chown -R 10001:10001 /srv/allerac-workspace`, then set `EXECUTOR_WORKSPACE=/srv/allerac-workspace` in `.env`.
4. Remove `HOST_WORKSPACE` from `.env`.

## File structure

```
infra/executor/
├── server.js    # HTTP server — single file, no dependencies
└── Dockerfile
```
