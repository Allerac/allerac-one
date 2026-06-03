# Domain: Health

**Slug:** `health`  
**Route:** `/health`  
**Icon:** ❤️  
**Status:** Active  
**Default Skill:** `health` (`skills/health.md`)

## Purpose

Health and wellness assistant with direct access to Garmin Connect data. The AI can query steps, sleep stages, heart rate, body battery, calories burned, and recent activities, then provide coaching, training plans, and recovery analysis.

## Key Files

| Layer | Path |
|-------|------|
| Page (server) | `src/app/health/page.tsx` |
| Client layout | `src/app/health/HealthClient.tsx` |
| Health tool | `src/app/tools/health.tool.ts` |
| Skill | `skills/health.md` |
| Garmin service | `services/health-worker/garmin.py` |
| Worker | `services/health-worker/app.py` |
| Architecture doc | `docs/health/README.md` |

## Tools Available

Health tools are only injected when `HEALTH_WORKER_SECRET` is set in environment.

| Tool | Description |
|------|-------------|
| `get_health_summary` | Aggregated metrics by period (day/week/month/year) |
| `get_health_metrics` | Detailed metric arrays for a date range |
| `get_daily_snapshot` | All metrics for a single day |
| `get_garmin_status` | Device connection and last sync status |
| `get_recent_activities` | Recent workouts/exercises |
| `search_web` | Web search via Tavily |
| `read_url` | Fetch and read a URL |
| `get_today_info` | Current date/time |

## External Integrations

- **Garmin Connect** — SSO authentication via garth library (OAuth 1 + OAuth 2)
- **health-worker** — Python FastAPI service running separately (`allerac-health-worker` container)
- **Cloudflare Tunnel** — exposes the health-worker to the outside when running on mini-PC (for VM deployments that can't reach Garmin SSO directly)

## Auth Flow

See `docs/health/README.md` for the full auth flow. Short version:
1. User provides Garmin email + password via the domain settings
2. health-worker authenticates with Garmin SSO and stores a garth session dump in `garmin_credentials`
3. On each tool call, health-worker loads the session and calls the Garmin Connect API
4. If `AUTH_WORKER_URL` is set, authentication is routed through a Cloudflare Worker (bypasses cloud IP blocks from Garmin)

## DB Tables

| Table | Purpose |
|-------|---------|
| `garmin_credentials` | Encrypted garth session dump per user |
| `health_daily_metrics` | Cached daily health data |
| `health_sync_jobs` | Background sync job tracking |
| `health_mfa_sessions` | Pending MFA sessions |

## Notes

- Garmin SSO blocks connections from cloud VMs (Azure, AWS, GCP). Local/residential IPs work fine.
- The health-worker runs as a separate Python service to isolate the garth dependency from the Node.js app.
