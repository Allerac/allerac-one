# Allerac One — Infrastructure Design

Allerac One is a self-hosted AI platform built for privacy, reliability, and multi-cloud portability. Every architectural decision reflects a deliberate trade-off between simplicity, security, and operational control.

---

## Zero Trust Networking

All public traffic is routed through **Cloudflare Tunnel** (`cloudflared`). The tunnel creates an outbound-only encrypted connection from the VM to Cloudflare's edge — no inbound ports are opened on the firewall, no public IP needs to be exposed for the application.

This means:
- No port 80/443 open on the VM for the app
- No TLS certificates to manage (Cloudflare terminates TLS at the edge)
- No attack surface for port scanners or direct connection attempts
- Access control via **Cloudflare Zero Trust** policies (email allowlists, identity providers)

For local development, **Caddy** replaces the tunnel — serving `https://home.allerac` with self-signed TLS so the developer experience mirrors production without needing to expose anything to the internet.

---

## Full-Stack Observability

The monitoring stack runs entirely on the VM alongside the application:

- **Prometheus** scrapes metrics from the app, Docker daemon, and host system
- **node-exporter** exposes CPU, memory, disk, and network metrics
- **Grafana** provides dashboards and alerting on top of Prometheus and Loki
- **Loki** aggregates all container logs
- **Promtail** ships Docker container logs to Loki automatically, with labels per container

This means there is no external monitoring service dependency. Logs and metrics stay on the machine, costs nothing extra, and works even without internet access.

---

## Local-First AI

**Ollama** runs LLM inference directly on the VM. No prompts, conversations, or user data are sent to external AI providers unless explicitly configured. This is the foundation of the privacy model: the AI runs where the data lives.

Models are pulled once and stored in a persistent Docker volume (`ollama_data`), surviving deploys and restarts.

---

## Stateless Application, Stateful Data

The application container (`allerac-app`) is fully stateless — it can be stopped, rebuilt, and restarted at any time without data loss. All persistent state lives in external Docker volumes:

- **PostgreSQL with pgvector** (`db_data`) — conversations, memory, user data, RAG embeddings
- **Ollama models** (`ollama_data`) — downloaded LLM weights
- **Backups** (`backups_data`) — database backup archives

External volumes are created once and never recreated empty on subsequent deploys, making `docker compose up --build` safe to run at any time.

Database migrations run automatically on every deploy as a one-shot container (`allerac-migrations`), applying only pending changes and exiting cleanly.

---

## Multi-Cloud Portability

The entire infrastructure is defined in Terraform, split across three clouds (GCP, Azure, AWS) with identical structure:

```
infra/terraform/
  gcp/      providers.tf  networking.tf  compute.tf  storage.tf  cloudflare.tf
  azure/    providers.tf  networking.tf  compute.tf  storage.tf  cloudflare.tf  ssh_keys.tf
  aws/      providers.tf  networking.tf  compute.tf  storage.tf  cloudflare.tf
```

Each cloud runs the same set of services. Switching clouds is a `terraform apply` in the target directory. DNS records are managed by Terraform and point to Cloudflare Tunnel IDs — switching a cloud updates the DNS automatically.

The naming convention is consistent across clouds:

| | App | Portainer | Grafana |
|---|---|---|---|
| GCP | `chat.allerac.ai` | `portainer.chat.allerac.ai` | `grafana.chat.allerac.ai` |
| Azure | `app.allerac.ai` | `portainer.app.allerac.ai` | `grafana.app.allerac.ai` |
| AWS | `hub.allerac.ai` | `portainer.hub.allerac.ai` | `grafana.hub.allerac.ai` |

### `instagram.allerac.ai`

A separate global subdomain on Azure, kept independent from the cloud-specific naming. Instagram's OAuth app requires a fixed callback URL (`https://instagram.allerac.ai/api/instagram/callback`) — renaming it requires updating the app registration in Meta's developer portal and disrupts active OAuth sessions.

---

## Self-Healing CI/CD

Each VM runs a **GitHub Actions self-hosted runner**, labeled by cloud (`gcp`, `azure`, `aws`). Deployments are triggered by pushes to `main` and run directly on the target VM — no external CI service required.

The **webhook service** (optional profile) receives GitHub push events, validates HMAC-SHA256 signatures, and triggers `update.sh`, which pulls the latest code and restarts only the containers that changed.

Build cache is limited to 20 GB via Docker's daemon GC configuration, and a weekly cron removes dangling images and stopped containers — preventing disk exhaustion over time.

---

## Docker Compose Profiles

The application stack uses Docker Compose profiles to adapt to the environment without maintaining separate compose files:

| Profile | Additional services | When to use |
|---------|--------------------|----|
| *(none)* | — | base stack, always started |
| `cloud` | `allerac-tunnel` | cloud VMs with Cloudflare Tunnel |
| `local` | `allerac-caddy` | local development with `home.allerac` |
| `webhook` | `allerac-webhook` | CI/CD via GitHub webhooks |

This means the exact same `docker-compose.yml` runs correctly on a developer laptop, a GCP VM, an Azure VM, and an AWS EC2 instance — with no modifications.
