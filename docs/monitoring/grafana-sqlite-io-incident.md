# Grafana SQLite I/O Saturation Incident

## Status

Open investigation. The Grafana container is currently the confirmed source of abnormal disk reads, but the root cause has not been resolved.

## Symptoms

- The VM showed sustained disk I/O wait near 90% during application image builds.
- `pidstat` attributed approximately 220-280 MB/s of reads to the Grafana process.
- Grafana logged repeated `database is locked`, cleanup timeout, and garbage-collection failures.
- Stopping `allerac-grafana` returned host I/O wait to normal and allowed the deployment build to complete.

## Evidence collected

- Container: `allerac-grafana`.
- Persistent volume: `allerac_grafana_data` mounted at `/var/lib/grafana`.
- SQLite database: `/var/lib/grafana/grafana.db`.
- Database size at the time of investigation: approximately 2.1 MB.
- Total Grafana volume size: approximately 53 MB.
- A copied database passed `PRAGMA integrity_check` with result `ok`.

The small database and successful integrity check suggest that capacity alone does not explain the read rate. The lock and cleanup loop remains the primary investigation target.

## Safety constraints

Do not delete the `allerac_grafana_data` volume or `grafana.db`. Preserve dashboards, users, data sources, and other Grafana state until a verified backup and recovery procedure exists.

## Next investigation

1. Confirm whether the high read rate returns after Grafana runs for several hours.
2. Capture Grafana version, active plugins, and SQLite journal mode.
3. Inspect long-running Grafana queries and background cleanup jobs.
4. Temporarily disable nonessential plugins one group at a time and measure I/O after each change.
5. Review whether moving Grafana metadata from SQLite to PostgreSQL is justified for this deployment.
6. Record measurements before and after every change.

Any destructive cleanup or database replacement requires an explicit backup and user approval.
