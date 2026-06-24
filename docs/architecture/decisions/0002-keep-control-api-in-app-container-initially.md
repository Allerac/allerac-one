# ADR 0002: Keep Control API In The App Container Initially

## Status

Accepted

## Date

2026-06-24

## Context

ADR 0001 accepts `/api/v1` as the Allerac control plane. That decision raises a
separate deployment question: should the Control API immediately become its own
container, or should it start inside the existing `app` container?

The current `app` container owns:

- the Next.js web UI;
- existing `/api/*` routes;
- new `/api/v1/*` Control API routes;
- server actions used by current UI workflows;
- shared service imports;
- session-cookie authentication helpers;
- some background runtime startup.

Creating a separate `api` container now would require solving framework choice,
shared auth/session behavior, CORS, service-layer packaging, environment boundaries,
healthchecks, logs, deployment ordering, and duplicated build concerns before the API
contracts themselves are mature.

At the same time, Allerac does need a future split plan. The long-term target is not
an indefinitely monolithic app process.

## Decision

Keep the Control API inside the existing `app` container initially.

The first goal is to stabilize contracts, not process boundaries. `/api/v1` route
handlers should stay thin and should call shared services behind stable DTOs and
response envelopes. This keeps the API extractable later without forcing a container
split before the resource contracts are proven.

The preferred future split order is:

1. `agent-worker` — move background agent execution out of the web-serving process.
2. `api` — extract the Control API once auth, scopes, DTOs, tests, and OpenAPI are
   stable enough to justify a separate service.
3. `web` — keep the browser UI as a client of the Control API where practical.

The target future shape is:

```text
web container
  Browser UI and UI-only rendering concerns
        |
        v
api container
  /api/v1 control plane, auth, validation, stable resource contracts
        |
        v
service/runtime layer
  Postgres, executor, Ollama, provider APIs
        ^
        |
agent-worker container
  background run polling, execution orchestration, stale-run recovery
```

This split is intentionally deferred until the contracts have enough coverage and
operational value.

## Consequences

### Positive

- The API can evolve quickly without introducing a second application framework.
- Browser session authentication works without cross-service cookie/session design.
- Existing service imports can be reused while contracts stabilize.
- The current Docker Compose deployment remains simple.
- Tests, Bruno smoke flows, OpenAPI, and docs can mature before runtime extraction.

### Negative

- The `app` container continues to serve both UI and Control API traffic.
- Some background runtime coupling remains until `agent-worker` is split out.
- API resource limits, scaling, and logs are not isolated from the web app yet.
- A future extraction will still require careful packaging of shared services.

### Neutral

- `/api/v1` must be designed as if it could move later.
- Server actions may coexist with Control API routes during migration.
- Existing `/api/*` routes remain until their consumers move or are retired.

## Extraction Readiness Criteria

Do not create a separate `api` container until most of these are true:

- API key authentication and scopes are implemented.
- Core resources have stable DTOs and tests.
- OpenAPI is maintained for every `/api/v1` contract.
- Bruno or automated smoke coverage exists for critical workflows.
- Shared services do not depend on UI-only Next.js behavior.
- The web UI can call `/api/v1` for at least one meaningful domain workflow.
- Logs and healthchecks define clear API versus web responsibilities.

Split `agent-worker` earlier when background execution needs independent lifecycle,
scaling, or failure isolation from HTTP serving.

## Alternatives Considered

### Create A Separate API Container Now

Rejected for the current milestone. It adds deployment and packaging complexity before
the Control API has enough stable surface area.

### Keep Everything In The App Container Indefinitely

Rejected as the long-term direction. It preserves the coupling that ADR 0001 is meant
to reduce.

### Split Web And API Before Worker Runtime

Deferred. The worker runtime has the clearer lifecycle mismatch with web serving, so
`agent-worker` is the more likely first extraction.
