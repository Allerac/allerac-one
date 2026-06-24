# Deployments

Allerac One currently uses Docker Compose deployments.

The recommended environment names are:

| Environment | Target | Purpose |
|---|---|---|
| `sandbox-home` | Home machine | Integration testing before production |
| `prod-azure` | Azure VM | Production deployment |

Use [Sandbox Home](sandbox-home.md) for integration testing and
[Prod Azure](prod-azure.md) for production deploys and release rehearsals.

Current production deploy state:

- manual Azure deploys are supported with `DEPLOY_BRANCH=main`;
- release-triggered Azure deploys are prepared through `/hooks/deploy-release`;
- GitHub must be configured with a release webhook before final releases deploy
  automatically.
