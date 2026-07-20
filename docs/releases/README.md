# Releases

Allerac One releases record operational milestones, not only source code tags.

The current release model is:

1. validate the candidate from `development`;
2. open a release PR from `development` to `main` and wait for the CI baseline;
3. merge the green release PR into `main`;
4. create a GitHub pre-release from `main`;
5. wait for CI baseline and Playwright release smoke;
6. promote the same release to final;
7. deploy production and run the public Control API smoke through Cloudflare.

## Releases

| Version | Date | Source | Status |
|---|---|---|---|
| `v0.1.0-beta.1` | TBD | TBD | Planned beta |
| `v0.0.1` | 2026-06-24 | `main` | Released |
| `v0.0.1-rc.1` | 2026-06-24 | `development` | Validated release candidate |

## Planned Beta

[v0.1.0 Beta Release Plan](v0.1.0-beta.md) tracks the first beta focused on the
Control API as a production client surface, Cloudflare `/api/v1` edge policy, and
the Android robot app as the first external client prototype.

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

They target the release commit on `main` and stay marked as GitHub pre-releases
until the pre-release workflow is green.

Final releases use tags like:

```text
v0.0.1
```

They target `main` and are not marked as pre-releases.
