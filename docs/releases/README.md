# Releases

Allerac One releases record operational milestones, not only source code tags.

The current release model is:

1. validate the candidate from `development`;
2. create a GitHub pre-release;
3. wait for CI baseline and Playwright release smoke;
4. promote the same commit to `main`;
5. create the final GitHub release from `main`;
6. deploy production from `main`.

## Releases

| Version | Date | Source | Status |
|---|---|---|---|
| `v0.0.1` | 2026-06-24 | `main` | Released |
| `v0.0.1-rc.1` | 2026-06-24 | `development` | Validated release candidate |

## v0.0.1

`v0.0.1` is the first operational baseline for Allerac One.

It established:

- GitHub CI for Jest, schema smoke, production build, and docs build;
- pre-release Playwright smoke checks;
- Material for MkDocs documentation container;
- Control API v1 initial surface;
- Bruno collection for API testing;
- Azure production deploy validation;
- documented branch, release, and deploy flow.

Production validation:

- Azure deploy from `main` completed successfully;
- app healthcheck passed;
- `/api/v1/me` returned the authenticated user with a valid `session_token`.

## Release Candidate Policy

Release candidates use tags like:

```text
v0.0.1-rc.1
```

They target `development` and must stay marked as GitHub pre-releases.

Final releases use tags like:

```text
v0.0.1
```

They target `main` and are not marked as pre-releases.
