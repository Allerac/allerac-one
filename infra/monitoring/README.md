# Allerac Monitoring Stack

Observability infrastructure for Allerac One, composed of four services: **Prometheus** (metrics), **Loki** (logs), **Promtail** (log shipping), and **Grafana** (visualization).

## Architecture

```
Docker containers
      │
      │  stdout / stderr
      ▼
  [Promtail]  ──── reads logs via Docker socket ──► [Loki :3100]
                                                           │
  [node-exporter :9100]  ──► host metrics                  │
  [docker engine :9323]  ──► container metrics             │
      │                                                    │
      ▼                                                    │
  [Prometheus :9090]  ─────────────────────────────────────┤
                                                           │
                                                    [Grafana :3001]
                                                           │
                                                    ┌──────┴──────┐
                                              Docker Logs    Node Exporter
                                              Dashboard       Dashboard
```

## Services

### Prometheus
**Port:** `9090`

Scrapes metrics from:

| Job | Target | What it collects |
|---|---|---|
| `prometheus` | `localhost:9090` | Prometheus self-metrics |
| `node-exporter` | `node-exporter:9100` | Host CPU, memory, disk, network |
| `docker` | `host.docker.internal:9323` | Docker engine and container metrics |

Scrape interval: **15 seconds**

### Loki
**Port:** `3100`

Log aggregation backend. Receives logs from Promtail and makes them queryable in Grafana via LogQL.

- **Retention:** 30 days (`720h`)
- **Storage:** filesystem (`/tmp/loki/chunks`)
- **Schema:** v13 (TSDB), 24h index period
- **Cache:** embedded, 100MB

### Promtail
Log shipping agent. Reads logs from all running Docker containers via the Docker socket and forwards them to Loki.

Labels attached to each log stream:

| Label | Source |
|---|---|
| `container` | Docker container name |
| `container_id` | Docker container ID |
| `image` | Docker image name |
| `service` | `com.docker.compose.service` label |
| `project` | `com.docker.compose.project` label |

### Grafana
**Port:** `3001` (mapped from container port 3000)

**Default credentials:** `admin` / `admin` (override with `GRAFANA_PASSWORD` env var)

Datasources provisioned automatically:

| Name | Type | URL | Default |
|---|---|---|---|
| Prometheus | prometheus | `http://prometheus:9090` | Yes |
| Loki | loki | `http://loki:3100` | No |

## Dashboards

Dashboards are provisioned automatically from `grafana/dashboards/` on startup.

### Docker Logs
Queries the Loki datasource. Provides a unified view of log streams from all Docker containers, filterable by `container`, `service`, and `project` labels.

### Node Exporter Full
Queries the Prometheus datasource. Provides detailed host-level metrics: CPU usage, memory, disk I/O, network throughput, system load, and more.

## Querying logs (LogQL examples)

```logql
# All logs from a specific container
{container="allerac-one-app-1"}

# Errors across all containers in the project
{project="allerac-one"} |= "error"

# Logs from the telegram bot in the last hour
{service="telegram-bot"} | json
```

## Configuration files

```
infra/monitoring/
├── prometheus/
│   └── prometheus.yml              # Scrape targets and intervals
├── loki/
│   └── loki-config.yml             # Storage, retention, schema
├── promtail/
│   └── promtail-config.yml         # Docker log discovery and label mapping
└── grafana/
    ├── provisioning/
    │   ├── datasources/
    │   │   └── datasources.yml     # Auto-provisioned datasources
    │   └── dashboards/
    │       └── dashboards.yml      # Dashboard provider config
    └── dashboards/
        ├── docker-logs.json        # Docker Logs dashboard definition
        └── node-exporter-full.json # Node Exporter Full dashboard definition
```

## Adding a new dashboard

1. Build or export the dashboard JSON from Grafana UI (Dashboard → Share → Export)
2. Save it to `grafana/dashboards/your-dashboard.json`
3. It will be loaded automatically on the next Grafana restart

## Adding a new Prometheus scrape target

Edit `prometheus/prometheus.yml` and add a new job under `scrape_configs`:

```yaml
- job_name: 'my-service'
  static_configs:
    - targets: ['my-service:8080']
```

Then reload Prometheus (no restart needed if lifecycle API is enabled):
```bash
curl -X POST http://localhost:9090/-/reload
```
