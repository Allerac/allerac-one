# Grafana SQLite I/O Saturation Incident

## Status

Root cause identified 2026-07-25. Confirmed to be Grafana's SQLite-backed metadata
store contending with itself and with the production VM's disk throughput ceiling.
Workaround (stop Grafana) remains in effect; permanent fix not yet implemented — see
[Recommended fix](#recommended-fix).

## Summary

The Grafana container enters a sustained loop that reads its own SQLite database
(`grafana.db`) at roughly 200-280 MB/s combined across its process/threads, with
essentially no writes. This pins the VM's data disk at 85-95% utilization and drives
read latency into the hundreds of milliseconds. It has caused two separate incidents:

- The `v0.0.13` production deploy required a manual `tmux` build after CI timed out.
- The `v0.0.20`-era deploy on 2026-07-25 was cancelled by GitHub Actions' 30-minute
  job timeout (run `30171696936`) — cause confirmed live, not just inferred.

Stopping `allerac-grafana` immediately drops host I/O to ~0% and the deploy completes
normally (confirmed 2026-07-25: 30+ minute timeout → 1m59s). Starting Grafana again
reproduces the high read rate within minutes.

## Root cause (confirmed 2026-07-25)

Two contributing factors, both required to produce the severity observed:

1. **Grafana's background subsystems collide on SQLite's single-writer lock.**
   `docker logs allerac-grafana` shows continuous, concurrent failures across
   unrelated subsystems, all blocked on the same lock:
   - `cleaning up inactive secure values` — new in Grafana's App Platform / unified
     storage layer (secrets management), fails repeatedly with `context deadline
     exceeded`.
   - `Failed to execute k8s dashboard cleanup` — the newer Kubernetes-style resource
     storage for dashboards (`dashboard.grafana.app`), fails with `database is
     locked`.
   - `bleve-backend` full-text search indexing — took **1m12s** to index 3
     dashboards on first build.
   - Classic cleanup jobs also contend: expired login attempts, expired
     images/snapshots, auth token cleanup, Alertmanager config reload, remote-cache
     garbage collection — each logs `[sqlstore.max-retries-reached] retry 1:
     database is locked`.

   This points to Grafana's newer "unified storage" / App Platform architecture
   (introduced in recent 11.x/12.x releases) running several additional SQLite-backed
   background services on top of the classic ones, all serializing through one
   SQLite file. The image is pinned to `grafana/grafana:latest`, so the exact version
   that introduced this has not been pinned down, but the log signatures
   (`dashboard.grafana.app`, `secure values`, `bleve-backend`) are specific to the
   unified-storage feature set, not present in older Grafana releases.

2. **The VM's disk cannot sustain what Grafana demands even without retries.**
   The production VM (`Standard_F4ads_v7`) has a single 64 GB Premium SSD (P6 tier)
   OS disk — confirmed via the Azure Instance Metadata Service. A P6 Premium SSD is
   provisioned for roughly 240 IOPS / 50 MB/s baseline throughput. Grafana alone was
   measured reading 200-280 MB/s, **4-5x the disk's provisioned throughput**, even
   before accounting for the app container, Postgres, and everything else sharing
   the same disk. Any sustained SQLite workload at that volume would saturate this
   disk regardless of what's causing Grafana to read that much.

## Live reproduction (2026-07-25)

Grafana was restarted after a deploy and observed for ~15 minutes before being
stopped again. `iostat -x 1` on `nvme1n1` (the data disk):

| Metric | With Grafana running | After `docker stop allerac-grafana` |
|---|---:|---:|
| Read throughput | 246-254 MB/s | 0 MB/s |
| Disk utilization | 86-91% | 0% |
| I/O queue depth (`aqu-sz`) | 780-963 | 0 |
| Read latency (`r_await`) | 280-393 ms | — |
| System iowait | 78-85% | ~0% |
| `uptime` load average (1 min) | 6.43 (on a 4-vCPU VM) | 0.41 |

`pidstat -d` attributed the read load to two `grafana` PIDs (471110: ~165-238 MB/s,
458245: ~47-85 MB/s), zero write throughput — consistent with the original incident.

A live diagnostic (`grafana cli --version`, run inside the container) itself hung for
over 2 minutes in kernel state `D` (uninterruptible sleep on I/O) before being killed
manually — direct evidence that even trivial operations against this Grafana
installation are blocked on disk, not just the specific cleanup jobs logged above.

## Safety constraints

Do not delete the `allerac_grafana_data` volume or `grafana.db`. Preserve dashboards,
users, data sources, and other Grafana state until a verified backup and recovery
procedure exists. (Note: dashboards themselves are reprovisioned from
`infra/monitoring/grafana/dashboards/*.json` on every start and are not at risk;
what would be lost from the volume is admin/user accounts, API keys, and alert
state, none of which are currently in active use on this deployment.)

## Recommended fix

See the full [Grafana Postgres Migration Plan](grafana-postgres-migration-plan.md)
for the step-by-step implementation, exact compose diff, and rollback plan. Summary:

Two changes, both required for a durable fix (either alone is a partial mitigation):

1. **Move Grafana's metadata backend from SQLite to Postgres**, using the existing
   `allerac-db` Postgres instance (`GF_DATABASE_TYPE=postgres` and related env vars,
   pointed at a new `grafana` database on the same Postgres server). This removes the
   single-writer-lock contention that's the proximate cause of the retry storm —
   Postgres handles concurrent writers natively. This was already listed as an
   open question in the original investigation plan below.
2. **Pin the Grafana image to a specific tested version** instead of `grafana/grafana:latest`,
   so the deployment stops silently drifting to whatever the newest release happens
   to be, and so this fix (and any future one) is reproducible.

Both changes are configuration-only (compose file + one new Postgres database);
no code changes required. The Grafana SQLite volume can be left in place
(untouched, unused) rather than deleted, in case a rollback is needed.

## Temporary workaround

Stop Grafana when it begins saturating the disk, or before triggering a production
deploy:

```bash
docker stop allerac-grafana
```

This disables dashboards and alert visualization but does not affect the app,
Postgres, Loki, Prometheus, Caddy, or the Cloudflare tunnel — all share the disk but
none exhibit this behavior on their own.

## Original investigation notes (2026-07-18/20, superseded by the confirmed root cause above)

- Container: `allerac-grafana`; persistent volume `allerac_grafana_data` mounted at
  `/var/lib/grafana`; SQLite database `/var/lib/grafana/grafana.db`.
- Database size at first diagnosis: approximately 2.1 MB (total volume ~53 MB) — too
  small to explain the read rate by capacity alone, which is what pointed the
  investigation toward a lock/retry loop rather than a corrupted or bloated database.
- A copied database passed `PRAGMA integrity_check` with result `ok` — ruled out
  corruption as the cause.
- No abandoned `grafana.db-wal` or `grafana.db-journal` file was present while the
  container was stopped.

Original next-investigation list (mostly superseded, kept for the historical trail):

1. ~~Confirm whether the high read rate returns after Grafana runs for several
   hours.~~ It returns within minutes, not hours.
2. ~~Capture Grafana version, active plugins, and SQLite journal mode.~~ Version
   could not be captured live (the diagnostic command itself hung on I/O
   contention — see "Live reproduction" above); the log signatures were sufficient
   to identify the responsible subsystems without it.
3. ~~Inspect long-running Grafana queries and background cleanup jobs.~~ Done — see
   "Root cause" above.
4. Temporarily disable nonessential plugins one group at a time and measure I/O
   after each change. Not pursued once Postgres migration was identified as the
   more direct fix.
5. Review whether moving Grafana metadata from SQLite to PostgreSQL is justified —
   **yes, see "Recommended fix" above.**
6. Record measurements before and after every change — done for the stop/start
   cycle above; repeat for the Postgres migration once implemented.
