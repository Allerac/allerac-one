# Grafana Unified Storage — Sustained Disk I/O Report

**Status:** Grafana disabled in production 2026-07-30 (commented out in
`docker-compose.yml`, not removed). Suspected upstream bug/regression in
Grafana's "unified storage" subsystem (introduced v12.4, mandatory v13+),
distinct from and discovered after the
[SQLite classic-database incident](grafana-sqlite-io-incident.md) that this
same investigation originally set out to fix.

## Decision: disabled, not worked around further

The documented upstream mitigation (`GF_UNIFIED_STORAGE_MIGRATION_PARQUET_BUFFER=true`,
see "Next steps" below) was tested live in production on 2026-07-30. It looked
very promising initially — zero disk read growth for the first ~6 minutes
after restart, versus the previous behavior of immediate, continuous
saturation — but the same ~250-280 MB/s read storm recurred after
approximately 2.5 hours of clean operation. This directly disrupted two
separate production deploys the same day (both exceeded, or nearly exceeded,
GitHub Actions' 30-minute job timeout), on top of the original 2026-07-25
incident.

Given: (a) the officially documented mitigation proved insufficient, matching
a similar report already filed upstream
([grafana/grafana#122993](https://github.com/grafana/grafana/issues/122993));
(b) this has now disrupted production deploys three times; (c) Grafana is an
observability nicety here, not core to the Allerac product, with no alert
rules or automation depending on it; and (d) the production VM's disk is a
shared, size-constrained resource (also hosting the primary application
database) — the decision was to disable Grafana in production rather than
continue investing in workarounds for what increasingly looks like an
unresolved upstream bug. The `grafana` service block was commented out (not
deleted) in `docker-compose.yml`, and the `grafana_data` volume was left in
place, so re-enabling later (e.g., once Grafana Labs addresses this, or if a
working configuration is found) doesn't require restoring from backup.
Prometheus, Loki, and Promtail are unaffected and continue running normally —
only Grafana itself (the dashboard/alerting UI consuming them) is disabled.

**Environment:**
- Grafana image: `grafana/grafana:13.1.1` (pinned; previously floating `:latest`)
- Classic database backend: PostgreSQL 16 (`GF_DATABASE_TYPE=postgres`), migrated
  from the bundled SQLite store on 2026-07-29 specifically to fix the earlier
  incident — see the migration plan linked above.
- Deployment: single Docker container, `docker-compose.yml`, on an Azure
  `Standard_F4ads_v7` VM with one 64 GB Premium SSD (P6 tier, ~50 MB/s baseline
  provisioned throughput) as the sole data disk, shared with the primary
  application Postgres instance, the app container, and everything else in the
  compose stack.
- Instance size: 3 dashboards, 3 folders/playlists total (see Evidence).

## Summary

After migrating Grafana's classic database from SQLite to Postgres — which
successfully eliminated the original `database is locked` errors on the classic
`sqlstore` tables — the Grafana process continued to generate sustained,
massive disk reads (**~250 MB/s continuously**, confirmed for at least 18 hours
without let-up) that saturate the host's sole data disk (86-93% utilization,
I/O queue depth 780-963, read latency up to 393ms). This is independent of the
classic-database fix: `GF_DATABASE_TYPE=postgres` did not reduce it.

The read volume is disproportionate to any plausible legitimate workload for
this instance by multiple orders of magnitude — see Evidence.

## Impact

- The shared production disk was pinned near 100% utilization for at least 18
  continuous hours, twice (2026-07-25 and 2026-07-29/30), with the same
  magnitude both times.
- `docker rm -f` on an already-dead, unrelated container took 6+ minutes during
  a production deploy (normally near-instant) due to disk contention caused by
  this read load running concurrently.
- Grafana's own Postgres queries began failing with `context deadline exceeded`
  as a second-order effect — i.e., the read storm degraded the very database
  connection Grafana needs to operate, and put the *shared* disk (also serving
  the primary application's Postgres instance) at risk.
- Workaround in place both times: `docker stop allerac-grafana`. Monitoring
  dashboards are unavailable while stopped; no other Allerac service is
  affected by stopping Grafana specifically.

## Evidence

### Sustained read volume, live measurement

`iostat -x 1` on the VM's data disk (`nvme1n1`) while Grafana was running,
sampled at multiple points across an 18-hour window:

| Metric | Value |
|---|---|
| Read throughput | 246-254 MB/s (sustained, not bursty) |
| Disk utilization | 86-93% |
| I/O queue depth (`aqu-sz`) | 780-963 |
| Read latency (`r_await`) | 66-393 ms (healthy baseline: <5ms) |

### Cumulative confirmation via `/proc/<pid>/io`

The Grafana container's main process (host PID, verified against
`docker inspect --format '{{.State.Pid}}'` to rule out a stale/wrong PID):

```
read_bytes: 10697520451584   (~9.73 TiB)
```

accumulated between container start (`2026-07-29T13:32:11Z`) and the
observation point (`2026-07-30T07:29 UTC`) — roughly 18 hours, consistent with
the live-measured ~250 MB/s rate sustained the entire time, not just at
startup.

### What was ruled out

- **Dashboard/panel query load.** Only 3 dashboards are provisioned. Panels
  query Prometheus and Loki over the network (HTTP), not local disk on the
  Grafana container — dashboard complexity cannot produce local block-device
  reads of this volume.
- **The classic-database migration retrying/looping.** Queried
  `unifiedstorage_migration_log` directly in the now-Postgres-backed `grafana`
  database: exactly 2 rows, `folders and dashboards migration` and
  `playlists migration`, both `success = true`, both timestamped
  `2026-07-29 13:32:16` — i.e., the migration completed once, cleanly, in
  under a second, at container start. It is not retrying.
- **Local file/volume size.** `/var/lib/grafana` (the persistent volume) totals
  53.1 MB, almost entirely third-party plugin bundles. A 1.9 MB `grafana.db`
  SQLite file is still present despite `GF_DATABASE_TYPE=postgres` — see
  Hypothesis. No file or directory in the volume is remotely large enough to
  account for terabytes of reads by content volume alone.
- **The container's own writable layer.** `docker system df -v` reports ~9 MB
  for this container's unique/writable layer — also far too small.

## Hypothesis (circumstantial, not source-verified)

Grafana v12.4+ introduced automatic migration to "unified storage" for
instances below an undocumented dashboard/folder count threshold — this
instance (3 dashboards) qualifies every time it starts. The migration itself
is not the problem (it completes in under a second, confirmed above). The
leading hypothesis, based on the evidence above, is that some component of the
unified storage subsystem — plausibly internal locking/coordination
(`infra.lockservice` appeared in this project's earlier, pre-Postgres-migration
incident logs with `database is locked` errors) or the resource-object storage
backing `dashboard.grafana.app` — retains a dependency on a small local
artifact (consistent with the still-present `grafana.db`) that it re-reads in
a tight loop, independent of `GF_DATABASE_TYPE`. A small file re-read
continuously at high frequency would produce exactly this signature: a tiny
file on disk, but an enormous cumulative `read_bytes` counter, because the
same bytes are being re-fetched repeatedly rather than new data being read
once.

This has not been confirmed against Grafana's source code — it is the
explanation best supported by the evidence collected, not a verified root
cause.

## Corroborating upstream signal

Grafana's own documentation for `[unified_storage]` only covers configuration
in terms of a SQLite backend (`migration_cache_size_kb`,
`migration_parquet_buffer` — both framed as remedies for "SQLite locking
problems... during migration"), with no documented option to point this
specific subsystem at Postgres, separate from the classic `[database]`
section. This suggests the subsystem may have an embedded-storage dependency
that isn't fully decoupled from the classic backend choice, at least not
through documented configuration.

A related (not identical) community report,
[grafana/grafana#122993](https://github.com/grafana/grafana/issues/122993),
describes a v12→v13 migration failing with sustained `SQLITE_BUSY`/"database is
locked" retry storms against unified storage, tagged upstream with
`area/backend/db/sqlite` and **`type/regression`** — i.e., Grafana Labs' own
issue tracker already classifies problems in this area as a regression, not
expected behavior. That report used a SQLite classic backend (unlike this
deployment, which is Postgres-backed), and the reporter tried
`GF_UNIFIED_STORAGE_MIGRATION_PARQUET_BUFFER=true` without it resolving their
issue — so it is not a confirmed fix, but it is the officially documented
mitigation for this problem class and is worth testing here regardless, since
this deployment's specific combination (Postgres classic backend + persistent
post-migration read storm) does not exactly match any single public report
found during this investigation.

## What was tried

- Migrating the classic database to Postgres and pinning the image version
  (2026-07-29): fixed the original `database is locked` errors on classic
  `sqlstore` tables. Did **not** fix this issue — the read storm persisted
  after this fix, with the same magnitude as observed before it, just with a
  different log signature (`context deadline exceeded` instead of
  `SQLITE_BUSY`/"database is locked").
- `docker stop allerac-grafana`: fully resolves the symptom immediately (disk
  utilization and load average return to baseline within seconds), same as
  the original incident. Not a fix — Grafana is simply not running.

## Next steps

1. ~~Test `GF_UNIFIED_STORAGE_MIGRATION_PARQUET_BUFFER=true`.~~ Done
   2026-07-30. Local testing was inconclusive (the dev machine's disk is fast
   enough that the read storm never visibly saturates it — 0 measurable
   growth over 5 minutes even without the fix, so there was no local signal to
   compare against). Tested live in production instead: promising for ~6
   minutes, then the same storm recurred after ~2.5 hours. Not a fix — see
   "Decision" above.
2. **Done: Grafana disabled in production** (2026-07-30), per the decision
   above, rather than continuing to invest in workarounds for an apparent
   upstream bug in a ~3-month-old feature (GA'd 2026-04-14).
3. Consider filing this as a new upstream issue against `grafana/grafana` —
   the evidence in this report (successful one-time migration, ruled-out local
   storage sources, sustained multi-terabyte cumulative reads against a
   Postgres-backed classic database, and confirmed-insufficient documented
   mitigation) is more complete than the existing related issue and
   specifically implicates the Postgres-backed configuration, which does not
   appear to be covered by existing reports. Not yet filed.
4. Re-enabling later: uncomment the `grafana:` service block in
   `docker-compose.yml` (left in place, not deleted) once either an upstream
   fix ships, or the production VM moves to a disk with enough throughput
   headroom to absorb this workload without visible impact (a mitigation, not
   a fix — would mask rather than resolve the underlying inefficiency).
