# Allerac One Documentation

Allerac One is a private-first AI agent platform designed to run on your own
infrastructure.

This documentation covers the product architecture, domains, skills, tickets,
background agents, operations, security, and the planned Control API v1.

## Current Architecture

The current system is a unified Next.js application with API routes, server actions,
business services, background runtime, PostgreSQL, Ollama, and specialized worker
services.

Start with the [Architecture Overview](architecture/architecture.md).

## Platform Direction

The next major platform milestone is the [Allerac Control API v1](architecture/control-api-v1.md),
a stable control plane for the web UI, Telegram, CLI, external automations, and future
headless deployments.

Architecture decisions are tracked in [Architecture Decision Records](architecture/decisions/README.md).

