# CI, Releases, and Versioning

This document defines the intended GitHub automation model for Allerac One.

## Per-PR Gates

Two workflows run on **every pull request, whatever its base branch**
(`development`, `main`, or a stacked feature branch such as a PR on top of
another PR), and on every push to `development` and `main`. There are no path
filters and no nightly schedule: a docs-only PR gets the same gates, so nothing
merges without them. A new push to a PR cancels its superseded runs. Both use
`permissions: contents: read` and need no secrets, so PRs from forks work.

`.github/workflows/ci.yml` (also reused by the pre-release and production
workflows through `workflow_call`):

| Job | Purpose |
|---|---|
| `test` (Jest) | Full Jest suite with throwaway `ENCRYPTION_KEY`, `TELEGRAM_TOKEN_ENCRYPTION_KEY`, `EXECUTOR_SECRET`. Any failing test fails the job |
| `typecheck` | `npm run typecheck:baseline`: `tsc --noEmit`, fails on any error not in `ci/tsc-baseline.txt` |
| `lint` | `npm run lint:baseline`: ESLint on the repo, fails on any problem not in `ci/eslint-baseline.txt` |
| `schema` | Database migration equivalence smoke test with Docker |
| `build` | Compile the production Next.js app |
| `docs` | Build Material for MkDocs with `--strict` |

`.github/workflows/integration.yml`:

| Step | Purpose |
|---|---|
| Build | `docker buildx bake` of `app`, `agent-worker` and `executor` only, with the GitHub Actions cache (no Ollama, monitoring, n8n or Portainer images) |
| `scripts/ci/security-integration.sh` | Brings up the default Unit's core (`db`, `migrations`, `executor`, `app`, `agent-worker`) with a generated throwaway `.env`, seeds an admin and a non-admin, and checks the shell hardening end to end (see below) |
| `scripts/smoke/multi-unit-smoke.sh` | Brings up a second, lean Unit next to it (reusing the images) and checks it has no executor/Portainer, its own names/volumes/network, and that the shell is refused even for an admin |
| Logs | On failure, every container's logs and `docker inspect` are uploaded as the `integration-logs` artifact |

`security-integration.sh` asserts: executor runs as uid 10001 with a read-only
rootfs, `CapEff` zero and `NoNewPrivs` 1; its only mounts are its workspace
volume and the two helper scripts (no `/home`, `/project`, `/root` or Docker
socket); it refuses a short `EXECUTOR_SECRET`; `/execute` answers 401 without or
with a wrong secret (from the app container); every published port is bound to
`127.0.0.1` except the intentionally public ones (app 8080, Ollama 11434, docs
8000, Caddy 80/443, webhook 9999, garmin-auth-worker 8787), and 3001 is never
published (checked on the running containers and on the config with every
profile); an admin gets `/workspace` 200 and `POST /api/workspace/run` 200, and
the command cannot see `EXECUTOR_SECRET` or write to `/`; a non-admin gets 403
on all 7 `/api/workspace/*` routes (8 calls) and 404 on `/workspace`; no session
gets 401; registration is closed by default (the real `checkFirstRun` server
action reports `registrationOpen: false`, and the `register` action creates no
user). It is runnable locally, see the header of the script.

Expected duration: Jest/tsc/ESLint/schema/docs run in parallel in about 3 to 5
minutes, the production build in about 4 to 6. The integration job takes about
8 to 12 minutes, mostly the app image build. Warm GHA cache keeps the
dependency layers, so the time is mostly `next build`.

Playwright is still not part of the PR workflows. It runs in the pre-release
workflow (release smoke).

### "No new errors" baselines

The repository still has TypeScript and ESLint debt, so those two jobs compare
with committed baselines instead of requiring zero:

- `ci/tsc-baseline.txt`: one line per known error, `<file>: <TScode>: <message>`
  (no line or column, so moving code does not break the gate).
- `ci/eslint-baseline.txt`: `<file> <rule> <severity> <count>`.

`scripts/ci/check-baseline.mjs` fails when a key is missing from the baseline or
its count goes up, and prints every location of that key plus GitHub
annotations. When problems are fixed it still passes and asks you to shrink the
baseline:

```bash
npm run typecheck:baseline     # what CI runs
npm run lint:baseline
npm run baseline:update        # rewrite both baselines; commit them in the same PR
```

Only shrink the baselines. Never regenerate them to hide a new problem; review a
baseline diff like code. Generate them from a clean `npm ci --legacy-peer-deps`
install: different dependency versions report different ESLint counts.

## Branch Protection

Recommended protection for `main` **and** `development`:

- require pull request before merge;
- require these status checks: `Jest`, `TypeScript (no new errors)`,
  `ESLint (no new problems)`, `Schema Smoke`, `Production Build`, `Docs Build`,
  `Docker security + multi-Unit`;
- require branches to be up to date before merge;
- disallow force pushes;
- require conversation resolution;
- require at least one approval once there are multiple maintainers.

Solo-development exception: direct pushes to `main` may remain possible while the
project is moving quickly, but release tags should only be created from a green
`main`.

## Versioning Policy

Use semantic versioning once public releases begin:

```text
MAJOR.MINOR.PATCH
```

| Bump | Use when |
|---|---|
| Patch | Bug fixes, docs, test-only changes, internal refactors with no contract change |
| Minor | New domain, new `/api/v1` resource, backwards-compatible feature |
| Major | Breaking API contract, migration that requires manual operator action, incompatible deployment model |

Before public releases, `0.x.y` is acceptable. In `0.x`, breaking changes can happen
inside minor versions, but they must be documented clearly.

## API Versioning

The Control API uses path versioning:

```text
/api/v1
```

Rules:

- backwards-compatible additions stay in `/api/v1`;
- response fields may be added but not renamed or removed without a migration plan;
- error envelopes must keep the `{ error: { code, message } }` shape;
- breaking changes require `/api/v2` or a documented deprecation window.

## Release Flow

Recommended release sequence:

1. Merge feature PRs into `development`.
2. Open the release PR from `development` to `main` and wait for the CI baseline.
3. Merge the green release PR into `main`.
4. Create a GitHub pre-release from `main`.
5. Wait for the pre-release workflow to pass:
   - CI baseline;
   - Playwright release smoke.
6. Promote the same release to final.
7. Wait for the production workflow to pass:
   - CI baseline;
   - Azure deployment;
   - internal release verification;
   - public Control API smoke through Cloudflare.

Stable release tags use:

   ```bash
   v0.2.0
   ```

Release candidate tags use:

```bash
v0.2.0-rc.1
```

For release candidates, create a GitHub pre-release from the already merged `main`
commit. The pre-release workflow runs:

- the full CI baseline;
- Playwright release smoke tests.

This gives browser-level confidence before promoting a candidate into a stable
release, without making every PR wait on browser automation.

## v0.0.1 Baseline

`v0.0.1` was the first release to exercise the full baseline:

- `v0.0.1-rc.1` was created from `development`;
- the pre-release workflow passed CI baseline and Playwright release smoke;
- the same commit was released as `v0.0.1` from `main`;
- Azure production deploy was validated with `/api/v1/me`.

## Future Release Automation

The next stable-release workflow should be `.github/workflows/release.yml`.

Suggested behavior:

- trigger on tags matching `v*`;
- run the same CI checks as PRs;
- build Docker image with build args:
  - `COMMIT_HASH`;
  - `BUILD_DATE`;
- publish image to GitHub Container Registry;
- create a GitHub Release with generated notes.

Do not publish production images from arbitrary branches.

## Quality Roadmap

| Step | Status | Notes |
|---|---|---|
| Full Jest suite green | Done | `npm test -- --runInBand` passes locally |
| CI workflow for PRs | Done | `.github/workflows/ci.yml` (every PR, any base) |
| Schema smoke in CI | Done | Requires Docker on GitHub-hosted runner |
| Docs strict build in CI | Done | Uses MkDocs Material Docker image |
| Public production API smoke | Done | Validates `/version` and API-key-authenticated `/me` through Cloudflare |
| API key auth in smoke tests | Done | Uses the `production` environment secret `PRODUCTION_SMOKE_API_KEY` |
| TypeScript CI gate | Done | No-new-errors gate against `ci/tsc-baseline.txt`; shrink the baseline as debt is fixed |
| ESLint CI gate | Done | No-new-problems gate against `ci/eslint-baseline.txt` |
| CI on every PR and push to `development`/`main` | Done | `ci.yml` and `integration.yml`, no path filters |
| Docker security integration in CI | Done | `scripts/ci/security-integration.sh` + lean Unit smoke |
| Pre-release Playwright smoke | Done | `.github/workflows/prerelease.yml` |
| Release docs | Done | `docs/releases/README.md` |
| Release-triggered Azure deploy | Done | Final GitHub releases run the self-hosted production deploy workflow |
| Release workflow | Planned | Add once Docker image publishing is required |
