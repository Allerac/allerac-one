# CI, Releases, and Versioning

This document defines the intended GitHub automation model for Allerac One.

## Current CI Baseline

The initial GitHub Actions workflow is `.github/workflows/ci.yml`.

It runs on:

- release pull requests from `development` to `main`;
- reusable calls from the pre-release and production release workflows;
- manual dispatch.

It does not run for ordinary pushes to `development` or `main`, or for pull
requests targeting `development`. This avoids duplicate runs while preserving the
release gate before `development` is merged into `main`.

Required checks:

| Job | Purpose |
|---|---|
| `test` | Install dependencies and run the full Jest suite |
| `schema` | Run database migration equivalence smoke test with Docker |
| `build` | Compile the production Next.js app |
| `docs` | Build Material for MkDocs with `--strict` |

Playwright is not part of the PR workflow yet. It runs in the pre-release workflow.

This makes ordinary PRs automatically answer:

- Did the tests pass?
- Do migrations still work from fresh and upgraded installs?
- Does the app compile?
- Does the documentation site build?

## Branch Protection

Recommended `main` protection:

- require pull request before merge;
- require the CI workflow to pass;
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
| CI workflow for PRs | Done | `.github/workflows/ci.yml` |
| Schema smoke in CI | Done | Requires Docker on GitHub-hosted runner |
| Docs strict build in CI | Done | Uses MkDocs Material Docker image |
| Public production API smoke | Done | Validates `/version` and API-key-authenticated `/me` through Cloudflare |
| API key auth in smoke tests | Done | Uses the `production` environment secret `PRODUCTION_SMOKE_API_KEY` |
| TypeScript CI gate | Blocked | Fix existing `npx tsc --noEmit` failures first |
| Pre-release Playwright smoke | Done | `.github/workflows/prerelease.yml` |
| Release docs | Done | `docs/releases/README.md` |
| Release-triggered Azure deploy | Done | Final GitHub releases run the self-hosted production deploy workflow |
| Release workflow | Planned | Add once Docker image publishing is required |
