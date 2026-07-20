# Grafana SQLite I/O saturation incident

**Status:** Open  
**First observed:** 2026-07-18  
**Affected service:** `allerac-grafana`  
**Production impact:** Severe host disk contention; Allerac application services remained available.

## Summary

The Grafana container can enter a loop that continuously reads its internal SQLite database. During the observed incident, the Grafana process read approximately 220-280 MB/s and kept host I/O wait between 85% and 93%. This made Docker image builds extremely slow and contributed to the production deployment exceeding the GitHub Actions 30-minute timeout.

Stopping `allerac-grafana` immediately reduced I/O wait to 0% and allowed the deployment to finish. Starting Grafana again reproduced the high read rate.

## Observed symptoms

- The VM remains responsive, but builds and disk-dependent commands become extremely slow.
- `vmstat` reports several blocked processes and sustained high `wa` values.
- `pidstat` attributes approximately 250 MB/s of reads to the `grafana` process, with almost no writes.
- Grafana logs repeatedly report SQLite locking and cleanup timeouts:

```text
Database locked, sleeping then retrying
database is locked
context deadline exceeded
Failed to execute k8s dashboard cleanup
failed to run garbage collect
```

## Diagnosis commands

Measure host I/O pressure:

```bash
vmstat 1 10
```

Identify processes performing more than 1 MB/s of disk I/O:

```bash
sudo pidstat -d -p ALL 1 5 | awk '$4 > 1024 || $5 > 1024'
```

Inspect recent Grafana errors:

```bash
docker logs --since 10m --tail 150 allerac-grafana 2>&1
```

## Findings so far

- The persistent volume is `allerac_grafana_data`, mounted at `/var/lib/grafana`.
- The complete volume was approximately 53 MB at the time of diagnosis.
- `grafana.db` was approximately 2.1 MB, so database size does not explain the read rate.
- No abandoned `grafana.db-wal` or `grafana.db-journal` file was present while the container was stopped.
- SQLite `PRAGMA integrity_check` returned `ok` against a copy of `grafana.db`.
- The behavior returned after the deployment restarted Grafana.
- The precise Grafana version and the operation holding the SQLite transaction have not yet been identified.

## Temporary workaround

Stop only Grafana when it begins saturating the disk:

```bash
docker stop allerac-grafana
```

This disables dashboards and alert visualization, but it does not stop Allerac, PostgreSQL, Loki, Prometheus, Caddy, or the Cloudflare tunnel. Do not delete the Grafana volume or `grafana.db` as part of this workaround.

After stopping Grafana, verify that I/O wait has returned to normal:

```bash
vmstat 1 5
```

## Next investigation

1. Record the exact Grafana image digest and application version.
2. Inspect active configuration, plugins, cleanup jobs, and unified-search settings.
3. Start Grafana under observation and identify the SQLite operation or goroutine retaining the lock.
4. Determine whether the behavior is a Grafana regression associated with the unpinned `latest` image.
5. Pin a tested Grafana version before re-enabling the service permanently.
6. Add an I/O-based health or deployment preflight check so monitoring cannot starve production builds unnoticed.

