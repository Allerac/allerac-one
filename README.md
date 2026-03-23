<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/logo.svg">
  <img src="public/logo-light.svg" alt="Allerac One" width="320" />
</picture>

# Allerac One

**Your private AI assistant. Runs on your hardware. Your data never leaves.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-required-blue.svg)](https://docs.docker.com/engine/install/)
[![Ollama](https://img.shields.io/badge/Ollama-local%20LLM-orange.svg)](https://ollama.ai)

[**Buy pre-configured hardware →**](https://allerac.ai) &nbsp;·&nbsp; [Cloud version](https://allerac.ai/cloud) &nbsp;·&nbsp; [Docs](docs/) &nbsp;·&nbsp; [Discord](https://discord.gg/allerac)

</div>

---

## What is it?

Allerac One is a self-hosted AI agent that runs entirely on your own machine — a mini PC, a home server, or any Linux/macOS box with 16 GB+ RAM.

You get a full chat interface, conversation memory, RAG over your own documents, web search, Telegram access, and local AI inference via Ollama — all in one Docker stack, running on your hardware.

**Zero subscriptions. Zero telemetry. Zero vendor lock-in.**

---

## Install in one command

```bash
curl -sSL https://get.allerac.com/install | bash
```

The script detects your OS, installs Docker if needed, asks your hardware tier, downloads the right AI model, and starts everything. Your assistant will be ready at **`http://localhost:8080`**.

> **Manual install:** `git clone https://github.com/allerac/allerac-one && cd allerac-one && ./install.sh`

---

## Why run your own AI?

| | ChatGPT / Copilot | Allerac One |
|---|:---:|:---:|
| Monthly cost | $20/month | **~€3/month** (electricity) |
| Your data | Sent to OpenAI | **Stays on your machine** |
| Works offline | No | **Yes** |
| Custom models | No | **Any Ollama model** |
| Your documents | Uploaded to cloud | **Stored locally** |
| GDPR / LGPD | Requires DPA | **Compliant by design** |

> A pre-configured N100 mini PC (~€150) pays for itself in 7 months vs. a ChatGPT subscription.

---

## What you get

- **Persistent memory** — the AI remembers context across conversations
- **RAG** — upload PDFs, docs, or notes and chat with your own knowledge base
- **Web search** — real-time answers via Tavily (optional)
- **Skills** — reusable prompt templates for recurring tasks (writing, code review, analysis)
- **Multi-model** — switch between local Ollama models, GPT-4o, Gemini, and more
- **Telegram bot** — chat with your AI from your phone
- **Health dashboard** — connects to Garmin for fitness and wellness context
- **Shell agent** — optional local shell execution for automation tasks
- **Scheduled jobs** — run prompts on a schedule
- **Backup & restore** — one-click database backup with download

---

## Hardware guide

| Tier | Recommended hardware | Model | Speed | Use case |
|------|----------------------|-------|-------|----------|
| **Lite** | Intel N100 · 16 GB | `qwen2.5:3b` | ~8 tok/s | Personal, always-on |
| **Home** | Intel i5 / Ryzen 5 · 32 GB | `qwen2.5:7b` | ~12 tok/s | Daily driver, family |
| **Pro** | Intel i7 / Ryzen 7 · 64 GB | `qwen2.5:14b` | ~15 tok/s | Power users, teams |
| **Pro + GPU** | i7 + NVIDIA RTX · 64 GB | `qwen2.5:32b` | ~40 tok/s | Maximum performance |

> **Don't want to configure it yourself?**
> [Buy an Allerac device — pre-installed, plug and play →](https://allerac.ai)

---

## Advanced install options

```bash
# Scripted / CI — no prompts
HARDWARE_TIER=lite ./install.sh

# With Telegram bot
HARDWARE_TIER=home ENABLE_NOTIFICATIONS=true ./install.sh

# With NVIDIA GPU acceleration (auto-detected by default)
HARDWARE_TIER=pro ENABLE_GPU=true ./install.sh

# Custom models
HARDWARE_TIER=custom OLLAMA_MODELS=qwen2.5:14b,deepseek-r1:8b ./install.sh
```

---

## Add features after install

```bash
# Telegram bot + notifications
docker compose -f docker-compose.local.yml --profile notifications up -d

# Grafana + Prometheus monitoring
docker compose -f docker-compose.local.yml --profile monitoring up -d
```

---

## Update

```bash
./update.sh
```

Pulls the latest code, rebuilds the app container, restarts. Your data is never touched.

---

## How it works

```
Your browser
     ↓
Next.js app  (port 8080)
     ↓
PostgreSQL 16 + pgvector  ←  conversations, documents, embeddings
     ↓
Ollama  ←  local LLM inference (100% on your hardware)
```

All services run in Docker. One `docker compose up` to start, `docker compose down` to stop.

**Stack:** Next.js 16 · React 19 · TypeScript · PostgreSQL 16 + pgvector · Tailwind CSS 4 · Ollama

---

## Cloud alternative

Prefer managed hosting? [Allerac Cloud](https://allerac.ai/cloud) gives you the same experience on our infrastructure — starting at €9/month, no setup required.

---

## Self-host on a server

Running on a VPS or home server behind a domain? Use the cloud install:

```bash
./install-cloud.sh
```

Includes Cloudflare Tunnel support for secure public access without opening ports.

---

## Security & privacy

- All data (conversations, documents, memories) stays in your local PostgreSQL
- API keys are encrypted at rest (AES-256)
- Ollama inference runs locally — prompts never leave your machine
- Optional: restrict shell agent access to a specific directory via `HOST_WORKSPACE`
- No analytics, no crash reporting, no call home

See [docs/security.md](docs/security.md) for the full security model.

---

## Documentation

- [Architecture](docs/architecture.md) — system design, data flow, technical decisions
- [Security model](docs/security.md) — how your data is protected
- [Local setup](docs/local-setup.md) — manual setup guide
- [Backup & restore](docs/database-backup-restore.md) — keeping your data safe

---

## Contributing

Allerac One is MIT licensed. Contributions welcome.

```bash
git clone https://github.com/allerac/allerac-one.git
cd allerac-one
cp .env.local.example .env   # fill in your keys
docker compose -f docker-compose.local.yml up -d
```

Open an issue before large changes so we can align on direction.

---

## Community

- [Discord](https://discord.gg/allerac) — get help, share setups, discuss models
- [GitHub Issues](https://github.com/allerac/allerac-one/issues) — bugs and feature requests
- [allerac.ai](https://allerac.ai) — pre-configured hardware and cloud hosting

---

## License

MIT — free to use, modify, and self-host.

Built with ♥ by [Allerac](https://allerac.ai)
