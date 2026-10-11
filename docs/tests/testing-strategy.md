# Testing Strategy

This document defines when and why Allerac One tests run. The goal is to make
quality checks predictable for humans, agents, pull requests, and releases.

## Test Layers

| Layer | Command | Purpose | Runs when |
|---|---|---|---|
| Unit and contract tests | `npm test -- --runInBand` | Jest tests for services, actions, API routes, security boundaries, and React components | Before PR merge and during local feature work |
| Schema smoke test | `npm run test:schema` | Proves fresh database installs and legacy upgrades produce equivalent schemas | Before PR merge when migrations or database code change; safe to run on every PR |
| Type check | `npm run typecheck:baseline` | `tsc --noEmit`, no errors beyond `ci/tsc-baseline.txt` | Every PR (CI) and before pushing |
| Lint | `npm run lint:baseline` | ESLint, no problems beyond `ci/eslint-baseline.txt` | Every PR (CI) and before pushing |
| Docker security integration | `bash scripts/ci/security-integration.sh` | Real containers: executor hardening, port exposure, shell access policy over HTTP, closed registration | Every PR (CI); locally on a throwaway Unit |
| Multi-Unit smoke | `bash scripts/smoke/multi-unit-smoke.sh` | A second, lean Unit next to the default one | Every PR (CI); locally before multi-Unit changes |
| Production build | `npm run build` | Verifies Next.js routes compile and the app can be packaged | Before PR merge and release |
| Docs build | `docker compose exec -T docs mkdocs build --strict` locally, or MkDocs Material container in CI | Verifies docs navigation and links are buildable | Before PR merge when docs change; safe to run on every PR |
| API smoke tests | Planned: `npm run test:api` | Real HTTP smoke tests against `/api/v1` | After API key auth foundation is implemented |
| Playwright E2E | `npm run test:e2e` | Browser-level user flows | Exploratory/full E2E runs |
| Release smoke E2E | `npm run test:e2e:release` | Minimal browser/API smoke test for release candidates | GitHub pre-releases and manual release validation |

## Jest

Jest is the default fast feedback layer.

Run the full suite:

```bash
npm test -- --runInBand
```

Run one file:

```bash
npm test -- --runTestsByPath src/__tests__/api/control-api-tickets.test.ts
```

Run while developing:

```bash
npm run test:watch
```

Jest should cover:

- pure services and repositories;
- security and ownership boundaries;
- API response envelopes and validation;
- server actions that mutate user-owned state;
- small React component behavior where regressions are cheap to catch.

Avoid tests that depend on real provider APIs. Provider calls should be mocked unless
the test is explicitly an integration smoke test with documented credentials.

## Schema Smoke Test

Run:

```bash
npm run test:schema
```

This starts a disposable PostgreSQL container, applies migrations in fresh-install
and legacy-upgrade paths, then compares schema signatures.

Use this test whenever a migration is added or changed. It is intentionally slower
than Jest but catches upgrade drift that unit tests cannot see.

## Build

Run:

```bash
npm run build
```

The current Next.js build skips TypeScript validation. Treat `npm run build` as a
packaging and route-compilation check, not as a full type gate.

## Type Check and Lint (baselines)

TypeScript and ESLint still have known problems, so CI gates on "no new
problems" against committed baselines (`ci/tsc-baseline.txt`,
`ci/eslint-baseline.txt`):

```bash
npm run typecheck:baseline
npm run lint:baseline
npm run baseline:update   # after fixing debt: shrink the baselines and commit them
```

A new error fails the job with its file, line and message. Fixed errors keep the
job green but print a reminder to shrink the baseline. See
`docs/tests/ci-and-versioning.md` for the format.

## Docker Integration

`scripts/ci/security-integration.sh` runs against real containers and is what
the `Integration` workflow runs on every PR. On a machine that already runs your
Unit, test a throwaway Unit instead (the script refuses to seed users into a
database that has real users, and to start over existing containers):

```bash
bash scripts/ci/generate-ci-env.sh .env.ci-sec ci-sec
bash scripts/ci/security-integration.sh --env-file .env.ci-sec --build --down
rm .env.ci-sec
bash scripts/smoke/multi-unit-smoke.sh
```

## API Smoke Tests

The first `/api/v1` smoke path is currently represented by the Bruno collection:

```text
bruno/Allerac-One
```

Manual flow:

1. `System / Me`
2. `Tickets / List Tickets`
3. `Tickets / Create Ticket`
4. `Tickets / Get Ticket`
5. `Tickets / Resolve Ticket`
6. `Tickets / Delete Ticket`

The next automation step is a `test:api` script that performs the same flow through
HTTP. While `/api/v1` only supports browser sessions, it should accept:

```bash
API_BASE_URL=http://localhost:8080
API_SESSION_TOKEN=<session_token>
npm run test:api
```

After scoped API keys exist, the same smoke test should prefer:

```bash
API_TOKEN=allerac_live_...
```

## Playwright

Playwright is the browser-level E2E layer. It should validate user-visible flows that
Jest cannot prove.

Run the current release smoke locally:

```bash
npm run test:e2e:release
```

Run the broader suite manually:

```bash
npm run test:e2e
```

The release smoke currently validates:

- `/login` serves a real browser page;
- `/api/v1/me` returns the stable unauthenticated Control API error envelope.

This is intentionally small. Release-candidate E2E should grow one stable flow at a
time: login/setup, tickets, Control API with API keys, then agent-run polling.

## Local Pre-PR Checklist

Before opening or updating a PR, run:

```bash
npm test -- --runInBand
npm run typecheck:baseline
npm run lint:baseline
npm run build
```

If database migrations changed, also run:

```bash
npm run test:schema
```

If docs changed:

```bash
docker compose exec -T docs mkdocs build --strict
```

## CI Policy

- Every pull request, whatever its base branch (stacked PRs included), and every
  push to `development` and `main` run Jest, the tsc and ESLint baselines, schema
  smoke, production build, docs build, and the Docker security + multi-Unit
  integration job. No path filters, no nightly schedule.
- Jest must be fully green: there is no quarantine list. Fix or delete a broken
  test in the PR that breaks it.
- TypeScript and ESLint gate on "no new problems"; baselines only shrink.
- No external API credentials and no repository secrets in PR workflows (fork
  PRs run the same checks).
- Playwright release smoke runs on GitHub pre-releases; it is not yet a PR gate.
