<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/logo.svg">
  <img src="public/logo-light.svg" alt="Allerac One" width="320" />
</picture>

# Allerac One

**Private-first AI agent platform for local, cloud, and future headless deployments.**

[![Docker](https://img.shields.io/badge/Docker-required-blue.svg)](https://docs.docker.com/engine/install/)
[![Ollama](https://img.shields.io/badge/Ollama-local%20LLM-orange.svg)](https://ollama.ai)
[![Docs](https://img.shields.io/badge/Docs-MkDocs%20Material-526CFE.svg)](docs/)

[Website](https://allerac.ai) &nbsp;·&nbsp; [Documentation](docs/) &nbsp;·&nbsp; [Roadmap](docs/roadmap/README.md) &nbsp;·&nbsp; [Control API](docs/architecture/control-api-v1.md)

</div>

---

## What Is Allerac One?

Allerac One is a self-hosted AI agent system designed to run on your own
infrastructure. It combines a Next.js web app, PostgreSQL with pgvector, local
LLM inference through Ollama, background agents, domain-specific tools, and
automation services into one Docker-based platform.

The current product is UI-first, but the platform is moving toward a stable
**Control API v1** so the web UI, Telegram, CLI, automations, and future
headless deployments can all use the same backend contract.

## Current Capabilities

- Chat interface with persistent conversation context.
- RAG over local documents and notes.
- Domain surfaces for chat, code, design, email, finance, health, notes,
  recipes, search, social, tickets, and writing.
- Local Ollama inference with optional external model providers.
- Background agent runs and scheduled work.
- Telegram and notification services.
- Health data worker and monitoring stack.
- Tickets domain with the first Control API v1 endpoints.
- MkDocs Material documentation container.
- Bruno collection for API testing.
- GitHub CI and pre-release smoke gates.

## Architecture At A Glance

```text
Browser / Bruno / future clients
        |
        v
Next.js app + API routes  (localhost:8080)
        |
        +--> PostgreSQL 16 + pgvector
        +--> Ollama
        +--> Executor service
        +--> Health worker
        +--> Optional Telegram, notifier, monitoring, tunnel, webhook services

Docs site: localhost:8000
```

See the [Architecture Overview](docs/architecture/architecture.md) and
[Containers](docs/containers/containers.md) docs for the full system map.

## Quick Start

The recommended path is Docker Compose:

```bash
cp .env.example .env
docker compose up -d
```

Default local URLs:

- App: `http://localhost:8080`
- Docs: `http://localhost:8000`

The install scripts are still available for device-style setup:

```bash
./install.sh
./install-cloud.sh
./update.sh
```

## Documentation

The documentation is part of the repo and is served by the `docs` container:

```bash
docker compose up -d docs
```

Important entry points:

- [Documentation Home](docs/index.md)
- [Roadmap](docs/roadmap/README.md)
- [Control API v1 Architecture](docs/architecture/control-api-v1.md)
- [Control API v1 Roadmap](docs/roadmap/control-api-v1.md)
- [Testing Strategy](docs/tests/testing-strategy.md)
- [CI and Versioning](docs/tests/ci-and-versioning.md)
- [Security](docs/security/security.md)

Private, commercial, or unfinished notes live under ignored/excluded docs areas
such as `docs/private`, `docs/business-model`, and `docs/self-development`.

## Control API V1

The Control API is the current platform milestone. It is intended to decouple
core Allerac functionality from the web container and provide a stable contract
for external clients and automations.

Current initial surface:

- `GET /api/v1/me`
- `GET /api/v1/tickets`
- `POST /api/v1/tickets`
- `GET /api/v1/tickets/:id`
- `PATCH /api/v1/tickets/:id`
- `DELETE /api/v1/tickets/:id`

Use the Bruno collection in `bruno/Allerac-One` to exercise these endpoints
locally.

## Development

Install dependencies:

```bash
npm install --legacy-peer-deps
```

Run the app outside Docker:

```bash
npm run dev
```

Run the Docker stack:

```bash
docker compose up -d
```

Useful commands:

```bash
npm test -- --runInBand
npm run test:schema
npm run build
npm run test:e2e:release
docker compose exec -T docs mkdocs build --strict
```

## Testing And Release Gates

The project now has a first quality baseline:

- Jest runs on pull requests to `main`.
- Schema smoke tests validate database schema equivalence.
- Production build runs in CI.
- MkDocs strict build runs in CI.
- Playwright release smoke tests run on GitHub pre-releases.

The pre-release workflow is triggered when a GitHub Release is marked as a
pre-release, or manually through `workflow_dispatch`.

See [Testing Strategy](docs/tests/testing-strategy.md) and
[CI and Versioning](docs/tests/ci-and-versioning.md).

## Repository Map

```text
src/app                 Next.js app, routes, actions, services, UI
src/database            Database init, migrations, schema smoke support
infra                   Executor, notifier, webhook, infrastructure services
services                Worker services outside the Next.js app
docs                    Public technical documentation
bruno                   API client collection for local testing
e2e                     Playwright tests
.github/workflows       CI and pre-release automation
```

## Security And Privacy

Allerac One is designed around local ownership of data:

- Conversations, memories, documents, tickets, and settings live in PostgreSQL.
- API keys and provider tokens are encrypted at rest.
- Ollama inference can run locally.
- Shell execution is isolated through the executor service and configurable
  workspace mounts.
- Cloudflare Tunnel, OIDC, and remote access features are optional.

Read the [Security](docs/security/security.md) docs before exposing an instance
outside a trusted local network.

## Contributing

This repository is being prepared as the real foundation for Allerac One. Before
large changes, start from the docs:

- Architecture decisions: `docs/architecture/decisions`
- Roadmap: `docs/roadmap`
- Testing policy: `docs/tests`
- Domain docs: `docs/domains`

Run the relevant tests before opening a PR and update documentation when a
change affects architecture, operations, user-facing behavior, or public API
contracts.

## License

The public license has not been finalized in this branch yet. Add a root
`LICENSE` file and `package.json` license metadata before opening the repository
as an open-source project.

Built by [Allerac](https://allerac.ai).
