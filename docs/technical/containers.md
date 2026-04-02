# Allerac One — Container Reference

All containers belong to the `allerac` Docker Compose project and are prefixed with `allerac-`.
One-shot containers (migrations, ollama-setup) run and exit normally on every deploy.

---

## Application

### `allerac-app`
**Image:** custom build (`Dockerfile`)
**Port:** `8080`
**Role:** Main Next.js application — serves the web UI and all API routes.
**Persistent data:** `allerac_backups_data` (database backups)
**Restart:** always

### `allerac-db`
**Image:** `pgvector/pgvector:pg16`
**Port:** internal only (not exposed)
**Role:** PostgreSQL 16 database with pgvector extension for RAG embeddings.
**Persistent data:** `allerac_db_data` (external volume — survives deploys)
**Restart:** always

### `allerac-migrations` *(one-shot)*
**Image:** `postgres:16-alpine`
**Role:** Applies pending SQL migrations on every deploy, then exits with code 0.
Migrations are tracked in the `schema_migrations` table — already-applied ones are skipped.

### `allerac-executor`
**Image:** custom build (`infra/executor/Dockerfile`)
**Port:** `3001` (internal)
**Role:** Sandboxed shell execution environment for the AI agent's shell tool.
Mounts the Docker socket and project directory so it can also trigger self-updates.
**Memory limit:** 256 MB
**Restart:** always

---

## AI / LLM

### `allerac-ollama`
**Image:** `ollama/ollama:latest`
**Port:** `11434` (internal)
**Role:** Runs local LLM inference on the server. No inference data leaves the machine.
**Persistent data:** `allerac_ollama_data` (models — external volume)
**Memory limit:** 8 GB (configurable via `OLLAMA_MEM_LIMIT`)
**Restart:** always

### `allerac-ollama-setup` *(one-shot)*
**Image:** `ollama/ollama:latest`
**Role:** Pulls the configured Ollama models after `allerac-ollama` becomes healthy.
Skips models that are already downloaded. Controlled by `OLLAMA_MODELS` env var (default: `qwen2.5:3b`).

---

## Messaging & Notifications

### `allerac-telegram`
**Image:** custom build (`Dockerfile.telegram`)
**Role:** Multi-bot Telegram gateway. Reads bot configurations from the database and dispatches messages to/from users.
**Memory limit:** 256 MB
**Restart:** always

### `allerac-redis`
**Image:** `redis:7-alpine`
**Port:** `6379` (internal)
**Role:** Message broker for notification streams between the app and the notifier service.
**Restart:** always

### `allerac-notifier`
**Image:** custom build (`infra/notifier/Dockerfile`, Go)
**Port:** `3002` (internal health endpoint)
**Role:** Cron scheduler and Redis Stream consumer. Evaluates scheduled jobs, generates LLM responses, and dispatches notifications via Telegram.
**Memory limit:** 128 MB
**Restart:** always

---

## Infrastructure

### `allerac-tunnel`
**Image:** `cloudflare/cloudflared:latest`
**Role:** Cloudflare Zero Trust tunnel. Routes public traffic from `allerac.cloud` to the local app without opening firewall ports.
Runs in host network mode.
**Restart:** always

### `allerac-webhook`
**Image:** custom build (`infra/webhook/Dockerfile`)
**Port:** `9999` → `9000` (internal)
**Role:** GitHub push webhook receiver. Validates HMAC-SHA256 signatures and triggers `update.sh` on pushes to `main`. Sends email notifications on deploy success/failure via Resend.
**Memory limit:** 128 MB
**Restart:** always

### `allerac-portainer`
**Image:** `portainer/portainer-ce:latest`
**Port:** `9000`
**Role:** Docker management UI. Accessible via Cloudflare Zero Trust at `portainer.allerac.ai`.
**Restart:** always

---

## Monitoring

### `allerac-prometheus`
**Image:** `prom/prometheus:latest`
**Port:** `9090`
**Role:** Time-series metrics database. Scrapes metrics from node-exporter and the Docker daemon.
**Restart:** always

### `allerac-grafana`
**Image:** `grafana/grafana:latest`
**Port:** `3001` (→ internal 3000)
**Role:** Metrics and log dashboards. Connects to Prometheus and Loki as datasources.
**Restart:** always

### `allerac-loki`
**Image:** `grafana/loki:latest`
**Port:** `3100`
**Role:** Log aggregation backend. Receives logs from Promtail and makes them queryable in Grafana.
**Memory limit:** 256 MB
**Restart:** always

### `allerac-promtail`
**Image:** `grafana/promtail:latest`
**Role:** Log shipping agent. Reads Docker container logs via the Docker socket and forwards them to Loki with labels (container, service, project, log level).
**Restart:** always

### `allerac-node-exporter`
**Image:** `prom/node-exporter:latest`
**Port:** `9100`
**Role:** Exposes host system metrics (CPU, memory, disk, network) to Prometheus.
**Restart:** always

---

## Volumes

| Volume | Type | Used by | Purpose |
|--------|------|---------|---------|
| `allerac_db_data` | external (persistent) | `allerac-db` | PostgreSQL data — survives deploys |
| `allerac_ollama_data` | external (persistent) | `allerac-ollama`, `allerac-ollama-setup` | Downloaded LLM models |
| `allerac_backups_data` | external (persistent) | `allerac-app` | Database backup archives |
| `allerac_prometheus_data` | auto | `allerac-prometheus` | Metrics history |
| `allerac_grafana_data` | auto | `allerac-grafana` | Dashboard config |
| `allerac_loki_data` | auto | `allerac-loki` | Log storage |
| `allerac_redis_data` | auto | `allerac-redis` | Redis persistence |
| `allerac_executor_workspace` | auto | `allerac-executor` | Shell tool working directory |
| `allerac_portainer_data` | auto | `allerac-portainer` | Portainer state |

External volumes are created by `update.sh` on first run and never re-created empty on subsequent deploys.

---

## Port Summary

| Port | Container | Exposed to |
|------|-----------|------------|
| `8080` | `allerac-app` | Host (Cloudflare tunnel → public) |
| `9000` | `allerac-portainer` | Host (Cloudflare Zero Trust) |
| `9090` | `allerac-prometheus` | Host |
| `9100` | `allerac-node-exporter` | Host |
| `3001` | `allerac-grafana` | Host (Cloudflare Zero Trust) |
| `3100` | `allerac-loki` | Host |
| `11434` | `allerac-ollama` | Internal only |
| `6379` | `allerac-redis` | Internal only |
| `3001` (internal) | `allerac-executor` | Internal only |
| `3002` (internal) | `allerac-notifier` | Internal only |
