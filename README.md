# Allerac One

Private-first AI agent. Runs on your own hardware or on the cloud. No subscriptions, no telemetry, no lock-in.

---

## Two ways to run it

### Local Hardware Line
Self-hosted on your own machine — Allerac Lite, Home, or Pro.
Runs fully offline with local AI models via Ollama.

### Cloud Services Line
Managed deployment on a server — allerac.cloud (Starter, Personal, Pro).
Uses GitHub Models API as the primary LLM, with Cloudflare Tunnel for public access.

---

## Local Hardware Line

### Requirements

- Linux (Debian/Ubuntu recommended) or macOS
- 16 GB RAM minimum (32 GB+ recommended)
- 20 GB free disk space
- Docker (installed automatically if missing)

### Install

```bash
git clone https://github.com/Allerac/allerac-one.git
cd allerac-one
./install.sh
```

The installer will ask you two questions:

**1. Which hardware tier?**

| Tier | Hardware | Models downloaded |
|------|----------|-------------------|
| Allerac Lite | N100 · 16 GB | qwen2.5:3b +  |
| Allerac Home | i5/Ryzen 5 · 32 GB | qwen2.5:3b +  |
| Allerac Pro | i7/Ryzen 7 · 64 GB | qwen2.5:3b +  |
| Custom | Any | You choose |

**2. Optional features?**

- **Notifications** — Telegram bot + Redis + Notifier
- **Monitoring** — Grafana + Prometheus

All security keys are generated automatically. The `.env` file is written for you.

Once done, open your browser at `http://localhost:8080`.

---

### Non-interactive install (scripted/CI)

```bash
HARDWARE_TIER=lite ./install.sh
HARDWARE_TIER=home ENABLE_NOTIFICATIONS=true ./install.sh
HARDWARE_TIER=pro ENABLE_MONITORING=true ENABLE_NOTIFICATIONS=true ./install.sh
```

---

### Add features after install

```bash
# Add Telegram bot + notifications
docker compose -f docker-compose.local.yml --profile notifications up -d

# Add monitoring (Grafana + Prometheus)
docker compose -f docker-compose.local.yml --profile monitoring up -d
```

---

### Update

```bash
./update.sh
```

Pulls the latest changes, rebuilds the app, and restarts containers.
Your data is never touched during updates.

---

### Uninstall

```bash
# Stop containers only (keeps data, images, .env)
./uninstall.sh

# Stop + remove Docker images (forces fresh rebuild on next install)
./uninstall.sh --clean

# Full clean slate — removes everything including data and .env
./uninstall.sh --all
```

---

## Cloud Services Line

### Requirements

- Linux server with Docker and Docker Compose
- Cloudflare Tunnel token ([Zero Trust dashboard](https://one.dash.cloudflare.com) → Networks → Tunnels)
- Domain configured in Cloudflare

### Install

```bash
git clone https://github.com/Allerac/allerac-one.git
cd allerac-one
./install-cloud.sh
```

The installer will prompt for:

| Variable | Required | Description |
|----------|----------|-------------|
| `TUNNEL_TOKEN` | Yes | Cloudflare Tunnel token |
| `GRAFANA_PASSWORD` | Yes | Grafana admin password |
| `GITHUB_TOKEN` | No | GitHub Models API token (users can also set their own in the app) |
| `TAVILY_API_KEY` | No | Web search API key |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token |

Encryption keys are generated automatically.

Once deployed:

| Service | URL |
|---------|-----|
| App | `http://localhost:8080` (+ your public hostname via Cloudflare) |
| Grafana | `http://localhost:3001` |
| Portainer | `http://localhost:9000` |

---

### Update

```bash
./update.sh
```

---

## Configuration reference

Your settings live in `.env`. The installer creates this file for you.
If you need to edit it manually, the annotated templates are:

- `.env.local.example` — Local Hardware Line
- `.env.cloud.example` — Cloud Services Line

Key variables:

| Variable | Description |
|----------|-------------|
| `ENCRYPTION_KEY` | AES key for encrypting API tokens stored in the database |
| `OLLAMA_MODELS` | Comma-separated list of models to download on first run |
| `OLLAMA_BASE_URL` | Ollama API endpoint |
| `TELEGRAM_TOKEN_ENCRYPTION_KEY` | AES key for Telegram bot tokens |
| `HOST_WORKSPACE` | Directory the AI agent can access on your machine (local only) |

---

## Daily use

After first login, go to **Settings** to:

- Add your GitHub token (for cloud models like GPT-4o and Mistral Large)
- Add a Tavily API key (for web search)
- Configure Telegram bots

The app works fully offline with local Ollama models — no external accounts required.

---

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — System design and data flow
- [`docs/security.md`](docs/security.md) — Security model
- [`docs/local-setup.md`](docs/local-setup.md) — Manual setup guide
- [`docs/deploy-test-plan.md`](docs/deploy-test-plan.md) — Deploy test checklists
- [`docs/database-backup-restore.md`](docs/database-backup-restore.md) — Backup and restore
