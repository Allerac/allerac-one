# Session Backlog

Persistent handoff for work that should continue in a later collaboration session.

## Working agreement

Every implementation follows this sequence:

1. changes are prepared locally;
2. the user tests and reviews them;
3. only after explicit approval does the user commit and publish them.

The assistant must not commit, push, merge, tag, release, or deploy changes.

## Next session

### Design and benchmark provider-independent local embeddings

**Status:** Local baseline implemented 2026-08-01; release validation and operational
health surface remain

**Priority:** High — semantic features are degraded after GitHub Models retirement

GitHub Models was fully retired on 2026-07-30. Tests against both the legacy and
documented endpoints confirmed that Allerac can no longer generate embeddings
through that service. The existing corpus is small, so preserving its 1536-dimensional
vector space is not required.

Continue from
[Provider-Independent Local Embeddings](../roadmap/provider-independent-local-embeddings.md).
The local baseline now uses `embeddinggemma` through Ollama at 768 dimensions behind
a provider-neutral contract. The migration was applied locally and all 804 Spotify
vectors were reindexed; no document chunks existed. Focused tests pass.

The Benchmark domain now includes `/benchmark/embeddings`, with server-side execution,
installed-model selection, multilingual retrieval scoring, latency/batch measurements,
and browser-local recent history.

Next, expand the retrieval set with real examples, expose embedding health and active
model identity in Health/Admin, add workload prioritization before large-scale
indexing, and validate the rebuilt app through the normal review/release workflow.
Anthropic and other remote chat providers remain independent. Do not mix vectors from
another model/version or change dimensions without running the guarded reindex process.

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

### Grafana disabled in production — commit and deploy the compose change

**Status:** Decision made and local edit prepared 2026-07-30; awaiting the
user's review, commit, and release (per the working agreement above — the
assistant does not commit/push/deploy).

`docker-compose.yml`'s `grafana:` service block is commented out locally
(not deleted; `grafana_data` volume left in place). This has **not** been
committed, pushed, or released yet — production's `docker-compose.yml` still
has Grafana active as of this writing, but the running `allerac-grafana`
container itself is stopped (manual workaround, will need to be
stopped again after any deploy that runs before this change ships, since a
plain `docker compose up -d` on the *current* committed compose file would
restart it). Once this change is committed and released through the normal
pipeline, no further manual stopping will be needed — `docker compose up -d`
will simply stop managing/recreating Grafana.

Reason: see next entry.

## Completed context

- **Grafana disk I/O — root cause found to be a second, distinct issue beyond
  the classic-database fix; decision made to disable.** The classic-database
  fix (SQLite → Postgres, `grafana/grafana:13.1.1` pinned, 2026-07-29)
  eliminated the original `database is locked` errors and remains correct —
  not in question. However, the same magnitude of disk saturation
  (~250-280 MB/s sustained reads, 86-93% disk utilization) recurred within
  hours and continued for at least 18 more hours, traced to Grafana's separate
  "unified storage" subsystem (mandatory auto-migration for small instances
  since v12.4), which retains a local-storage dependency independent of
  `GF_DATABASE_TYPE=postgres`. Confirmed via `/proc/<pid>/io`: ~9.73 TiB
  cumulative reads in 18 hours; ruled out dashboard content, migration retries
  (completed successfully in under a second per `unifiedstorage_migration_log`),
  and local file/volume size (53 MB total) as causes. Tested Grafana Labs'
  own documented mitigation (`GF_UNIFIED_STORAGE_MIGRATION_PARQUET_BUFFER=true`)
  live in production: looked clean for ~6 minutes, then the same storm
  recurred after ~2.5 hours, disrupting two more production deploys the same
  day (2026-07-30) on top of the original 2026-07-25 incident. Decision:
  disable Grafana in production (comment out the service, keep the volume)
  rather than continue investing in workarounds for what looks like an
  unresolved upstream bug in a ~3-month-old Grafana feature — Prometheus,
  Loki, and Promtail are unaffected and keep running. Full evidence, upstream
  references (including a related-but-not-identical public report where the
  same mitigation also failed), and re-enabling criteria in the
  [Unified Storage Disk I/O Report](../monitoring/grafana-unified-storage-disk-io-report.md).
  Related, resolved: [Grafana SQLite I/O saturation incident](../monitoring/grafana-sqlite-io-incident.md),
  [Grafana Postgres Migration Plan](../monitoring/grafana-postgres-migration-plan.md).

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
