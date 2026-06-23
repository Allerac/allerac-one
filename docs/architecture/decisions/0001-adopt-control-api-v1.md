# ADR 0001: Adopt Control API v1 As The Allerac Control Plane

## Status

Proposed

## Date

2026-06-23

## Context

Allerac One currently runs as a single Next.js-centered application. The `app`
container serves the browser UI, API routes, server actions, business services, and
background runtime. This has been useful for a fast self-hosted product: one deploy
path, one main service, and low operational overhead.

That shape is becoming a constraint:

- core workflows are naturally coupled to the web UI;
- non-browser clients such as Telegram, CLI, mobile apps, and external automations do
  not have a stable API contract;
- background execution is harder to separate from the web-serving process;
- headless deployments are possible only by treating internal endpoints as an
  implicit API;
- tests focus on implementation paths instead of stable product contracts.

The platform is moving toward domains, skills, tools, tickets, background agents, and
specialized workers. Those capabilities need a stable control plane.

## Decision

Introduce a versioned `/api/v1` Control API as the stable control plane for Allerac
One.

The Control API will:

- authenticate browser sessions and scoped non-browser API keys;
- expose stable resource contracts for core workflows;
- keep route handlers thin: auth, validation, service call, response mapping;
- reuse existing services and data models;
- allow the current web UI to continue working while API contracts are introduced
  incrementally;
- become the preferred integration surface for future clients and headless operation.

The first API slice should be deliberately small:

1. scoped API key authentication;
2. `GET /api/v1/domains`;
3. `GET/POST/PATCH /api/v1/tickets`;
4. contract tests for API scopes and user ownership.

See [Allerac Control API v1](../control-api-v1.md) for the phased plan.

## Consequences

### Positive

- The web UI becomes a client of the platform instead of the center of the platform.
- Telegram, CLI, mobile, and external automation can share the same contract.
- Headless deployments become a first-class direction.
- Worker separation becomes easier because workers can consume stable state and
  contracts rather than UI-specific flows.
- API contract tests can catch regressions earlier than end-to-end UI tests.
- Security boundaries become clearer through scoped API keys.

### Negative

- There will be two API surfaces during migration: existing `/api/*` routes and new
  `/api/v1/*` routes.
- Maintaining stable contracts requires discipline around versioning and error shapes.
- Some existing server actions and API routes will need adapter code before they can
  be retired or reused.
- API key management adds security-sensitive implementation work.

### Neutral

- The initial implementation does not require splitting containers.
- The existing UI does not need to migrate immediately.
- Postgres remains the durable state store.

## Alternatives Considered

### Keep The Current Next.js App Shape

Continue adding API routes and server actions as needed.

Rejected as the long-term direction because it keeps the browser UI as the product's
center of gravity and makes headless clients rely on unstable internal behavior.

### Split Backend And Frontend Immediately

Create a separate backend service and move API/business logic out of Next.js now.

Rejected for the first milestone because it creates too much migration risk. The
Control API should first stabilize contracts inside the existing app container.

### Expose Direct Database Or Internal Service Access

Let workers, CLI, or automation talk directly to Postgres or internal service modules.

Rejected because it bypasses auth, validation, audit, and ownership boundaries.

