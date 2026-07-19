# Roadmap

This section tracks implementation plans for major Allerac One platform milestones.

Roadmaps are operational documents. They answer:

- what we are building;
- why this phase exists;
- what should be done first;
- how we know a phase is complete;
- what can wait.

Architecture Decision Records explain decisions and tradeoffs. Roadmaps track the
sequence of implementation.

## Active Roadmaps

| Roadmap | Status | Purpose |
|---|---|---|
| [Control API v1](control-api-v1.md) | Beta baseline complete | Stable `/api/v1` control plane delivered; deferred contracts and UI migrations remain evolutionary work |
| [Portable Allerac Backup and Restore](portable-backup-restore.md) | Proposed — high priority for beta | Reconstruct application state on a clean, provider-independent Docker host |
| [Multi-Cloud Environment Provisioning](multi-cloud-environment-provisioning.md) | Proposed | Provision, restore, validate, and safely cut over Allerac environments across supported clouds |

## Long-Term Architecture

| Document | Status | Purpose |
|---|---|---|
| [Allerac Federation](../architecture/allerac-federation.md) | Directional | Define the long-term model for isolated domain cells cooperating through stable contracts |
