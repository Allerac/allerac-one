# VM Comparison: Azure vs AWS vs GCP for allerac-one

**Use case:** Self-hosted Next.js app + PostgreSQL + Ollama local inference (CPU)
**Region baseline:** North/West Europe
**Prices:** Pay-as-you-go, approximate. Verify before purchasing.

---

## Stack Requirements

| Component | vCPU | RAM | Disk |
|---|---|---|---|
| Ollama (3B model) | 2+ | ~2.5 GB | ~2 GB per model |
| Ollama (7B model) | 4+ | ~5 GB | ~5 GB per model |
| PostgreSQL + pgvector | 1 | ~512 MB | ~10 GB |
| Next.js + health-worker | 1 | ~512 MB | — |
| OS + buffer | — | ~512 MB | ~10 GB |
| **Minimum (3B models)** | **2** | **4 GB** | **40 GB** |
| **Recommended (7B models)** | **4** | **16 GB** | **100 GB+** |

> **Local NVMe vs managed disk:** Local NVMe is faster for model loading but **ephemeral** — data is lost if the VM is stopped/resized. Use a separate managed/persistent disk for PostgreSQL data. Models can live on local NVMe since they can be re-downloaded.

---

## Tier 1 — Minimum (3B models only)

| Provider | Instance | vCPU | RAM | Local Storage | Est. Cost/mo |
|---|---|---|---|---|---|
| **Azure** | Standard_F2als_v7 | 2 | 4 GiB | — | €85 |
| **Azure** | Standard_F2ads_v7 | 2 | 8 GiB | 220 GB NVMe | €120 |
| **AWS** | c6id.large | 2 | 4 GiB | 118 GB NVMe | ~€90 |
| **AWS** | m6id.large | 2 | 8 GiB | 118 GB NVMe | ~€140 |
| **GCP** | n2-standard-2 + local SSD | 2 | 8 GiB | 375 GB NVMe | ~€115 |

**Verdict:** RAM is tight for 3B models alongside Postgres + Next.js. Acceptable for very light usage only.

---

## Tier 2 — Recommended (3B comfortable, 7B possible)

| Provider | Instance | vCPU | RAM | Local Storage | Est. Cost/mo |
|---|---|---|---|---|---|
| **Azure** | Standard_F4alds_v7 | 4 | 8 GiB | 440 GB NVMe | €201 |
| **Azure** ⭐ | Standard_F4ads_v7 | 4 | 16 GiB | 440 GB NVMe | €242 |
| **AWS** | c6id.xlarge | 4 | 8 GiB | 237 GB NVMe | ~€175 |
| **AWS** ⭐ | m6id.xlarge | 4 | 16 GiB | 237 GB NVMe | ~€260 |
| **GCP** | c2-standard-4 + local SSD | 4 | 16 GiB | 375 GB NVMe | ~€200 |
| **GCP** ⭐ | n2-standard-4 + local SSD | 4 | 16 GiB | 375 GB NVMe | ~€190 |

**Verdict:** This is the sweet spot for allerac-one with local inference. 16 GiB handles a 7B model alongside the full stack with room to spare. 440 GB NVMe on Azure fits 50+ models.

---

## Tier 3 — Comfortable (multiple models, heavier usage)

| Provider | Instance | vCPU | RAM | Local Storage | Est. Cost/mo |
|---|---|---|---|---|---|
| **Azure** | Standard_F8ads_v7 | 8 | 32 GiB | 880 GB NVMe | €483 |
| **AWS** | m6id.2xlarge | 8 | 32 GiB | 474 GB NVMe | ~€530 |
| **GCP** | n2-standard-8 + local SSD | 8 | 32 GiB | 375 GB NVMe | ~€370 |

**Verdict:** Justified only if running 13B+ models or serving multiple users concurrently.

---

## Provider Notes

### Azure
- F-series v7 uses AMD EPYC Genoa — strong single-thread performance, good for Ollama CPU inference
- NVMe variants (`ads`, `alds`) have the largest local storage per tier
- Prices from Azure Portal, North Europe, March 2026

### AWS
- `c6id` (compute-optimized) and `m6id` (general purpose) have local NVMe instance store
- Newer `c7id`/`m7i` also available at slightly higher cost with better CPU generation
- Graviton (`c7gd`, `m7gd`) ARM instances are ~20% cheaper but require ARM-compatible Docker images — verify Ollama ARM support for your models

### GCP
- Local SSD must be added separately (375 GB per disk, up to 24 disks)
- Local SSD is **always ephemeral** on GCP — no exceptions
- GCP generally competitive on price for general-purpose (N2) workloads
- Committed use discounts (1yr/3yr) can cut costs by 30–55% on all three providers

---

## Recommendation for allerac-one

| Priority | Choice | Reason |
|---|---|---|
| **Best overall** | Azure Standard_F4ads_v7 (€242) | 440 GB NVMe, 16 GiB RAM, 4 vCPUs — fits the stack well |
| **Best price/perf** | GCP n2-standard-4 + local SSD (~€190) | Slightly cheaper, flexible local SSD sizing |
| **AWS equivalent** | m6id.xlarge (~€260) | Solid option, smaller local disk than Azure |

> Always use a **separate managed disk** (Azure Managed Disk / AWS EBS / GCP Persistent Disk) for PostgreSQL data — never rely on local NVMe for database storage.

---

## Cost Saving Tips

- **Reserved/Committed instances:** 1-year commitment saves ~35–40% on all three providers
- **Spot/Preemptible VMs:** Up to 80% cheaper but can be interrupted — not suitable for production
- **Start small:** allerac-one's traffic is typically low; F4ads_v7 at €242 → F2ads_v7 at €120 is a valid starting point for a single user
- **Shut down when idle:** If this is a personal instance, stopping the VM overnight saves ~50% on compute (you still pay for managed disks)
