# Grafana Postgres Migration Plan

**Status:** Implemented and verified in production 2026-07-29

**Depends on:** [Grafana SQLite I/O Saturation Incident](grafana-sqlite-io-incident.md) (root cause confirmed 2026-07-25)

**Enables:** Stops production deploys from being cancelled by GitHub Actions' 30-minute
timeout; removes the recurring need to manually stop Grafana before every deploy.

## Objective

Move Grafana's own metadata store (users, dashboards' organizational state, alert
rules, API keys, sessions — not the metrics/logs it visualizes) from its bundled
SQLite database to the existing `allerac-db` Postgres instance, and pin the Grafana
image to a specific version instead of the floating `:latest` tag.

## Why this fixes it (not just mitigates it)

Per the incident doc, the root cause has two independent parts:

1. Grafana's newer background subsystems (secure-values cleanup, k8s-style
   dashboard-resource cleanup, bleve search indexing, plus the classic cleanup jobs)
   all serialize through SQLite's single-writer lock, causing a retry storm.
2. The production VM's disk (64 GB Premium SSD, ~50 MB/s baseline throughput) can't
   sustain the resulting read volume (200-280 MB/s measured) regardless of cause.

Moving to Postgres fixes (1) directly — Postgres handles concurrent writers via MVCC,
so the background subsystems stop fighting over one exclusive file lock, regardless
of how many of them Grafana runs in any given version. It also indirectly resolves
(2), since the read volume driving the disk saturation was a symptom of the lock
contention, not an inherent requirement of what Grafana needs to do.

Pinning the version doesn't fix the root cause by itself, but makes the fix (and any
future change) reproducible instead of silently drifting on every image pull.

## Current state

```yaml
grafana:
  image: grafana/grafana:latest
  environment:
    - GF_SECURITY_ADMIN_USER=${GRAFANA_USER:-admin}
    - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}
    - GF_USERS_ALLOW_SIGN_UP=false
    - GF_ANALYTICS_REPORTING_ENABLED=false
    - GF_ANALYTICS_CHECK_FOR_UPDATES=false
    - GF_ANALYTICS_CHECK_FOR_PLUGIN_UPDATES=false
    - GF_PLUGINS_PREINSTALL_DISABLED=true
  volumes:
    - grafana_data:/var/lib/grafana
    - ./infra/monitoring/grafana/provisioning/datasources/prometheus.yml:...
    - ./infra/monitoring/grafana/provisioning/dashboards:...
    - ./infra/monitoring/grafana/dashboards:...
  depends_on:
    - prometheus
    - loki
```

`grafana_data` (Docker volume, named `allerac_grafana_data`) holds `grafana.db`
(SQLite) plus plugins/session state. Currently stopped on production as a workaround.

## Target state

```yaml
grafana:
  image: grafana/grafana:13.1.1
  environment:
    - GF_SECURITY_ADMIN_USER=${GRAFANA_USER:-admin}
    - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}
    - GF_USERS_ALLOW_SIGN_UP=false
    - GF_ANALYTICS_REPORTING_ENABLED=false
    - GF_ANALYTICS_CHECK_FOR_UPDATES=false
    - GF_ANALYTICS_CHECK_FOR_PLUGIN_UPDATES=false
    - GF_PLUGINS_PREINSTALL_DISABLED=true
    - GF_DATABASE_TYPE=postgres
    - GF_DATABASE_HOST=db:5432
    - GF_DATABASE_NAME=grafana
    - GF_DATABASE_USER=${POSTGRES_USER:-postgres}
    - GF_DATABASE_PASSWORD=${POSTGRES_PASSWORD:-postgres}
    - GF_DATABASE_SSL_MODE=disable
  volumes:
    - grafana_data:/var/lib/grafana   # kept for plugins only; no longer holds grafana.db state
    - ./infra/monitoring/grafana/provisioning/datasources/prometheus.yml:...
    - ./infra/monitoring/grafana/provisioning/dashboards:...
    - ./infra/monitoring/grafana/dashboards:...
  depends_on:
    prometheus:
      condition: service_started
    loki:
      condition: service_started
    db:
      condition: service_healthy
```

`GF_DATABASE_SSL_MODE=disable` matches how the app container already talks to `db`
(same internal Docker network, no TLS between containers). `db` already has a
healthcheck (`pg_isready`), so `condition: service_healthy` is a real dependency, not
just ordering.

## Implementation phases

### Phase 1: Create the `grafana` database (idempotent, safe to run anytime)

Run once against the existing Postgres instance — does not touch the `allerac`
database or any existing data:

```bash
docker compose exec -T db psql -U "${POSTGRES_USER:-postgres}" -d postgres -c \
  "SELECT 'CREATE DATABASE grafana' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'grafana')\gexec"
```

This can be run in advance of the rest of the migration with zero risk — an unused
empty database sitting on the server changes nothing until Grafana is pointed at it.

### Phase 2: Update `docker-compose.yml`

Apply the target-state diff above. This is the only code/config change required —
no application code changes.

### Phase 3: Redeploy Grafana only

```bash
docker compose up -d --force-recreate grafana
```

On first start against the new database, Grafana runs its own internal Postgres
schema migrations automatically (same mechanism it uses for SQLite) — no manual
schema setup needed beyond the empty database from Phase 1.

Expected outcome: Grafana starts with a fresh admin/user state (default
`admin`/`${GRAFANA_PASSWORD}` login), dashboards reprovision from
`infra/monitoring/grafana/dashboards/*.json` as usual (unaffected by this change),
and the `Prometheus`/`Loki` datasources reprovision from
`infra/monitoring/grafana/provisioning/datasources/*.yml` (also unaffected).

### Phase 4: Verify

Repeat the same measurement used to confirm the original diagnosis, for direct
before/after comparison:

```bash
# Should stay near 0 across the board, unlike the pre-fix baseline (86-91% util,
# 246-254 MB/s reads, 780-963 queue depth — see the incident doc)
iostat -x 1 5

# Should show no "database is locked" / "context deadline exceeded" lines
docker logs allerac-grafana --since 15m 2>&1 | grep -i "locked\|deadline exceeded"

uptime   # load average should stay well under vCPU count (4) sustained
```

Let Grafana run under normal conditions for a few hours before considering this
closed, since the original incident doc's first investigation step ("confirm
whether the high read rate returns after running for several hours") was never
completed — this migration is the fix, but the verification should still cover that
window, not just the first few minutes.

### Phase 5 (optional, later): Retire the SQLite volume

Once Postgres-backed Grafana has run cleanly for a while, `allerac_grafana_data` can
be reduced to plugins-only state or removed if no plugins are installed. Not urgent
— leaving the unused SQLite file in place costs nothing and preserves a rollback
path.

## Rollback plan

If the Postgres-backed Grafana doesn't come up cleanly:

```bash
# Revert docker-compose.yml to the current-state block above, then:
docker compose up -d --force-recreate grafana
```

The old `grafana_data` volume (SQLite state) is untouched by this migration, so
reverting the compose file and recreating the container restores the exact prior
behavior (including the I/O issue, which is why this is a rollback path, not the
target state).

## Open questions for whoever implements this

- Should Grafana use a dedicated Postgres role instead of reusing
  `${POSTGRES_USER}` (the same superuser the app uses)? Lower risk to scope a
  separate least-privilege role, but adds a setup step. Not blocking — reusing the
  existing user is consistent with how `migrations` and `executor` already connect.
- Confirm no one has customized the Grafana admin password or created manual API
  keys/alert rules on the current SQLite-backed instance before Phase 3 — that state
  will not carry over. (Per the incident doc, no alert rules are currently
  provisioned, and this is a small internal monitoring instance, so this is expected
  to be a non-issue, but worth a quick check before proceeding.)
- Same migration should apply to local/other deployments using this compose file,
  not just the Azure production VM — the SQLite contention is a Grafana behavior,
  not Azure-specific, though only the production VM's disk has been confirmed
  undersized enough to make it catastrophic.
