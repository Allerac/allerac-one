# Allerac One - Deploy Test Plan

Checklists for validating both product line deployments before shipping to customers.

---

## Local Hardware Line (`docker-compose.local.yml`)

Target hardware: Allerac Lite, Home, Pro

### Prerequisites

```bash
cp .env.example .env
# Set at minimum: ENCRYPTION_KEY
```

---

### T-L1: Core services (no profiles)

```bash
docker compose -f docker-compose.local.yml up -d
```

| # | Check | Expected |
|---|-------|----------|
| 1 | `docker compose -f docker-compose.local.yml ps` | `allerac-db`, `allerac-migrations`, `allerac-executor`, `allerac-app` all `running` / `exited 0` for migrations |
| 2 | `curl -s http://localhost:8080` | Returns HTML (login page) |
| 3 | `docker logs allerac-app` | No `ENCRYPTION_KEY` error, no DB connection error |
| 4 | `docker stats --no-stream` | `allerac-app` ≤ 1G RAM, `allerac-db` ≤ 512M |
| 5 | Register a user and send a chat message | Message returns a response (GitHub Models or error if no token configured) |

---

### T-L2: Ollama profile — Allerac Lite preset

```bash
OLLAMA_MODELS=qwen2.5:7b,deepseek-r1:1.5b \
  docker compose -f docker-compose.local.yml --profile ollama up -d
```

| # | Check | Expected |
|---|-------|----------|
| 1 | `docker logs allerac-ollama-setup` | "Pulling qwen2.5:7b..." and "Pulling deepseek-r1:1.5b..." then "Model setup complete!" |
| 2 | `docker exec allerac-ollama ollama list` | Both models present |
| 3 | Model selector in UI | `qwen2.5:7b` and `deepseek-r1:1.5b` visible |
| 4 | Chat with `qwen2.5:7b` | Response streams back |
| 5 | Re-run `ollama-setup` container | "already present, skipping." for both models |

---

### T-L3: Ollama profile — Allerac Home preset

```bash
OLLAMA_MODELS=qwen2.5:14b,mistral:7b,deepseek-r1:8b \
  docker compose -f docker-compose.local.yml --profile ollama up -d
```

| # | Check | Expected |
|---|-------|----------|
| 1 | `docker logs allerac-ollama-setup` | All 3 models pulled |
| 2 | `docker exec allerac-ollama ollama list` | 3 models present |
| 3 | Chat with each model | All respond correctly |

---

### T-L4: Ollama profile — Allerac Pro preset (GPU)

```bash
OLLAMA_MODELS=llama3.3:70b,qwen2.5:14b,command-r:35b \
  docker compose -f docker-compose.local.yml --profile ollama up -d
```

| # | Check | Expected |
|---|-------|----------|
| 1 | Before GPU: `docker logs allerac-ollama` | No CUDA errors (CPU inference) |
| 2 | Enable GPU: uncomment `deploy` block in `ollama` service, restart | `nvidia-smi` inside container shows GPU |
| 3 | `docker logs allerac-ollama-setup` | All 3 models pulled |
| 4 | Chat with `llama3.3:70b` | Response returns; inference faster than CPU |

---

### T-L5: Notifications profile

```bash
docker compose -f docker-compose.local.yml --profile notifications up -d
```

| # | Check | Expected |
|---|-------|----------|
| 1 | `docker ps` | `allerac-redis`, `allerac-notifier`, `allerac-telegram` running |
| 2 | `docker exec allerac-redis redis-cli ping` | `PONG` |
| 3 | `docker logs allerac-notifier` | No DB connection error, healthcheck passes |
| 4 | `docker stats --no-stream allerac-redis` | ≤ 128M RAM |
| 5 | (If `TELEGRAM_BOT_TOKEN` set) Send `/start` to bot | Bot responds |

---

### T-L6: Monitoring profile

```bash
docker compose -f docker-compose.local.yml --profile monitoring up -d
```

| # | Check | Expected |
|---|-------|----------|
| 1 | `curl http://localhost:9090/-/healthy` | `Prometheus Server is Healthy` |
| 2 | `curl http://localhost:9100/metrics` | node-exporter metrics response |
| 3 | Grafana at `http://localhost:3001` | Login page loads |
| 4 | Login with `admin` / `$GRAFANA_PASSWORD` | Dashboard accessible |
| 5 | `docker stats --no-stream allerac-prometheus allerac-grafana` | Both ≤ 256M RAM |

---

### T-L7: Full stack

```bash
docker compose -f docker-compose.local.yml \
  --profile ollama --profile notifications --profile monitoring up -d
```

| # | Check | Expected |
|---|-------|----------|
| 1 | `docker compose -f docker-compose.local.yml ps` | All services `running` (migrations `exited 0`) |
| 2 | App accessible at `:8080` | Functional |
| 3 | Grafana at `:3001` | Functional |
| 4 | Ollama at `:11434` | Responds to `ollama list` |
| 5 | Total container RAM | Within hardware tier limits |

---

### T-L8: Backups

| # | Check | Expected |
|---|-------|----------|
| 1 | Trigger backup via UI (Settings > Backup) | Backup file created in `allerac_backups_data` volume |
| 2 | `docker exec allerac-app ls /app/backups` | Backup `.sql` file present |
| 3 | Restore backup | Data restored, no errors |

---

### T-L9: Offline operation (no internet)

```bash
# Block outbound internet on the host, then:
docker compose -f docker-compose.local.yml --profile ollama up -d
```

| # | Check | Expected |
|---|-------|----------|
| 1 | App loads | No crash, no timeout waiting for cloud |
| 2 | Chat with local Ollama model | Full response without internet |
| 3 | GitHub Models request (if token set) | Graceful error, not crash |
| 4 | `docker logs allerac-app` | No fatal errors due to missing network |

---

## Cloud Services Line (`docker-compose.yml`)

Target: allerac.cloud managed deployment

### Prerequisites

```bash
cp .env.example .env
# Required: ENCRYPTION_KEY, TELEGRAM_TOKEN_ENCRYPTION_KEY, TUNNEL_TOKEN, GRAFANA_PASSWORD
```

---

### T-C1: Fail-fast on missing required secrets

```bash
# Test without required vars
unset ENCRYPTION_KEY TELEGRAM_TOKEN_ENCRYPTION_KEY TUNNEL_TOKEN GRAFANA_PASSWORD
docker compose up --no-start 2>&1
```

| # | Check | Expected |
|---|-------|----------|
| 1 | Missing `ENCRYPTION_KEY` | Error: `ENCRYPTION_KEY is required` — compose aborts |
| 2 | Missing `TELEGRAM_TOKEN_ENCRYPTION_KEY` | Error: `TELEGRAM_TOKEN_ENCRYPTION_KEY is required` — compose aborts |
| 3 | Missing `TUNNEL_TOKEN` | Error: `TUNNEL_TOKEN is required` — compose aborts |
| 4 | Missing `GRAFANA_PASSWORD` | Error: `GRAFANA_PASSWORD is required` — compose aborts |
| 5 | All vars set | Compose proceeds normally |

---

### T-C2: Core services startup

```bash
docker compose up -d
```

| # | Check | Expected |
|---|-------|----------|
| 1 | `docker compose ps` | All services `running` (migrations `exited 0`) |
| 2 | `curl http://localhost:8080` | Login page |
| 3 | `docker logs $(docker compose ps -q app)` | No errors |
| 4 | Register + login + send message | Working end-to-end |

---

### T-C3: DB not exposed externally

| # | Check | Expected |
|---|-------|----------|
| 1 | `docker compose port db 5432` | Empty / no output |
| 2 | `nc -zv localhost 5432` from host | Connection refused |
| 3 | `docker exec $(docker compose ps -q app) psql postgresql://postgres:postgres@db:5432/allerac -c '\l'` | Databases listed (internal access works) |

---

### T-C4: GitHub Models as primary LLM

```bash
# Set GITHUB_TOKEN in .env
```

| # | Check | Expected |
|---|-------|----------|
| 1 | GitHub Models models visible in UI model selector | Yes |
| 2 | Chat with a GitHub Models model | Response streams back |
| 3 | `GITHUB_TOKEN` propagated to app container | `docker exec ... env \| grep GITHUB_TOKEN` shows value |

---

### T-C5: Monitoring stack

| # | Check | Expected |
|---|-------|----------|
| 1 | `curl http://localhost:9090/-/healthy` | Healthy |
| 2 | Grafana at `http://localhost:3001` login with `GRAFANA_PASSWORD` | Working |
| 3 | Grafana default password `admin` is REJECTED | Yes (no default fallback) |
| 4 | Loki at `http://localhost:3100/ready` | `ready` |
| 5 | `docker stats --no-stream loki` | ≤ 256M RAM |
| 6 | Grafana → Explore → Loki datasource | App logs visible |

---

### T-C6: Redis + Notifier

| # | Check | Expected |
|---|-------|----------|
| 1 | `docker exec allerac-redis redis-cli ping` | `PONG` |
| 2 | `docker logs allerac-notifier` | No errors, healthcheck passes |
| 3 | `docker inspect allerac-notifier --format='{{.State.Health.Status}}'` | `healthy` |

---

### T-C7: Telegram Bot

| # | Check | Expected |
|---|-------|----------|
| 1 | `docker logs allerac-telegram` | No `ENCRYPTION_KEY` error, no crash |
| 2 | `TELEGRAM_TOKEN_ENCRYPTION_KEY` propagated | Encrypted tokens decryptable |
| 3 | (If `TELEGRAM_BOT_TOKEN` set) Send `/start` | Bot responds |

---

### T-C8: Cloudflare Tunnel

| # | Check | Expected |
|---|-------|----------|
| 1 | `docker logs allerac-tunnel` | `Connection ... registered` — no auth errors |
| 2 | App accessible at configured public hostname (e.g. app.allerac.cloud) | Login page loads |
| 3 | Portainer accessible at configured public hostname | Login page loads |
| 4 | Missing `TUNNEL_TOKEN` | Compose fails before starting (T-C1 covers this) |

---

### T-C9: Security checklist

| # | Check | Expected |
|---|-------|----------|
| 1 | DB port 5432 not bound on host | `ss -tlnp \| grep 5432` — empty |
| 2 | No hardcoded secrets in compose file | `grep -E "(default-dev-key\|change-in-production\|:-))" docker-compose.yml` — empty |
| 3 | `ENCRYPTION_KEY` has no default fallback | `grep "ENCRYPTION_KEY:-" docker-compose.yml` — empty |
| 4 | Grafana sign-up disabled | `GF_USERS_ALLOW_SIGN_UP=false` present |
| 5 | Executor workspace is isolated volume (not host `/home`) | Volume `executor_workspace` — not host path |

---

## Regression: Both Files

| # | Check | Expected |
|---|-------|----------|
| 1 | `docker compose -f docker-compose.local.yml config` | No YAML parse errors |
| 2 | `docker compose config` | No YAML parse errors (will warn on missing required vars — expected) |
| 3 | Volume names in local file have `allerac_` prefix | Prevents collision if both deploys run on same host |
| 4 | Cloud volumes have no name prefix (default) | Cloud runs in isolation, no collision risk |
