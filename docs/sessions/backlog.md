# Session Backlog

Persistent handoff for work that should continue in a later collaboration session.

## Working agreement

Every implementation follows this sequence:

1. changes are prepared locally;
2. the user tests and reviews them;
3. only after explicit approval does the user commit and publish them.

The assistant must not commit, push, merge, tag, release, or deploy changes.

## Next session

### Start portable backup and recovery inventory

**Status:** Ready to start

**Priority:** High for beta

Objective: define the first provider-independent recovery package and prove what is
required to reconstruct Allerac on a clean Docker host before automating another
cloud environment.

Start with these steps, one at a time:

1. Inventory PostgreSQL/pgvector data, Docker volumes, configuration, encrypted
   credentials, uploaded files, skills, and generated runtime state.
2. Classify what belongs in the portable package, what must be regenerated, and what
   must be supplied separately as a secret.
3. Define package metadata, checksums, version compatibility, and encryption.
4. Define restore preflight checks and non-destructive validation.
5. Create the smallest implementation only after the recovery contract is reviewed.
6. Prove recovery on a clean non-production host before changing DNS or production.

Continue from
[Portable Allerac Backup and Restore](../roadmap/portable-backup-restore.md). Do not
perform a production restore, delete volumes, rotate infrastructure secrets, or
change DNS without explicit user approval.

## Parked investigations

### Native iOS client

**Status:** Proposed; blocked on access to macOS/Xcode for the first signed build

Build a native SwiftUI client for the iPhone 13 Pro using the production Control API
and a dedicated scoped API key. Start with secure pairing and text conversations;
add voice only after the basic client works reliably on physical hardware.

Continue from the [iOS Client Architecture](../architecture/ios-client.md) and the
[iOS Client Roadmap](../roadmap/ios-client.md). Do not commit Apple signing assets or
client secrets.

### Benchmark evolution into Quality Evaluator

**Status:** Initial Benchmark domain implemented; quality-evaluation evolution deferred

Evolve the `/benchmark` domain from latency and throughput measurements into a
broader Quality Evaluator. Future iterations may add reusable evaluation datasets,
expected-answer criteria, model comparisons, scoring, cost and token analysis,
regression detection, and release quality gates. Keep the current benchmark
workflows working while introducing these capabilities incrementally.

### Multi-cloud environment provisioning

**Priority:** High for beta

**Status:** Documented; starts only after portable recovery is proven

After the portable backup project succeeds, continue with
[Multi-Cloud Environment Provisioning](../roadmap/multi-cloud-environment-provisioning.md)
to validate the existing Azure, AWS, and GCP Terraform foundations. Do not begin by
automating DNS changes or production cutover. All infrastructure mutations, restores,
and destructive cleanup require explicit user approval.

### Public repository and production runner hardening

**Status:** Assessment started; implementation not started

Before accepting untrusted external contributions, audit Git history for secrets and
personal data, rotate exposed credentials, isolate or strictly restrict the
production self-hosted runner, protect production environments and workflow changes,
pin third-party Actions, audit dependency and asset licenses, and define private
vulnerability reporting. Formal license selection remains a separate legal and
governance decision.

## Next session

### Grafana disk I/O — recurred from a second, distinct cause

**Status:** Open. Grafana stopped in production as of 2026-07-30.

The classic-database fix (SQLite → Postgres, `grafana/grafana:13.1.1` pinned,
2026-07-29) did eliminate the original `database is locked` errors and was
verified clean for 20 minutes post-deploy — that part of the fix is confirmed
working and not in question. However, the same magnitude of disk saturation
(~250 MB/s sustained reads, 86-93% disk utilization) recurred within hours and
continued for at least 18 more hours, this time traced to Grafana's separate
"unified storage" subsystem (mandatory auto-migration for small instances
since v12.4), which appears to retain a local-storage dependency independent
of `GF_DATABASE_TYPE=postgres`. Confirmed via `/proc/<pid>/io`: ~9.73 TiB of
cumulative reads in 18 hours; ruled out dashboard content, migration retries
(migration completed successfully in under a second, confirmed in
`unifiedstorage_migration_log`), and local file/volume size (53 MB total) as
causes. Likely an upstream Grafana bug/regression — full evidence, upstream
references, and next-step options in the
[Unified Storage Disk I/O Report](../monitoring/grafana-unified-storage-disk-io-report.md).

Next step in progress: testing `GF_UNIFIED_STORAGE_MIGRATION_PARQUET_BUFFER=true`
locally before considering it for production (Grafana Labs' documented
mitigation for this problem class, though a related public report found it
insufficient for a similar-but-not-identical SQLite-backed case).

Related, resolved: [Grafana SQLite I/O saturation incident](../monitoring/grafana-sqlite-io-incident.md),
[Grafana Postgres Migration Plan](../monitoring/grafana-postgres-migration-plan.md).

## Completed context

- Production baseline `v0.0.15` was reported released and validated on 2026-07-21.
  Its tag and commit were not present in the local clone during this backlog update;
  confirm them after the next tag fetch rather than relying on a guessed hash.
- Cloudflare now exposes `https://app.allerac.ai/api/v1/*` without an interactive
  Access login while the browser UI remains protected by `early-adopters`.
- Production `/api/v1/version` and API-key-authenticated `/api/v1/me` were validated
  through the public Cloudflare edge.
- The physical Android robot uses a dedicated production API key, connects without
  `adb reverse`, creates a production conversation, and completes a real interaction.
- Production deploy automation now verifies the internal build identity and runs
  public post-deploy smoke checks for `/api/v1/version` and `/api/v1/me`.
- CI automation was reduced to the release PR from `development` to `main`, the
  pre-release gate, the final release gate, and manual dispatch.
- A native iOS client architecture and roadmap were prepared locally. Native build,
  signing, and physical iPhone installation remain blocked on access to macOS/Xcode.
- The earlier `v0.0.13` deployment required a persistent `tmux` build after CI timed
  out; Grafana SQLite I/O saturation discovered during that incident remains open.
