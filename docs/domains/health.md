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
| Activity detail page (server) | `src/app/health/activities/[activityId]/page.tsx` |
| Activity detail content (map, charts, laps/zones/dynamics panels) | `src/app/components/health/ActivityDetailPanel.tsx` (+ `ActivityRouteMap.tsx`, `ActivityCharts.tsx`, `ActivityLapsPanel.tsx`, `ActivityZonesPanel.tsx`, `ActivityDynamicsPanel.tsx`) — rendered both by the standalone detail page (`ActivityDetailClient.tsx`) and inline on the `/health` dashboard for the selected day's activity (`RecentActivity.tsx`) |
| Detail sync (Phase 2/3 laps/zones/route/samples) | `src/app/services/health/detail-sync.service.ts` + `detail-sync-runner.service.ts` + `detail-sync.repository.ts` |
| Health tool | `src/app/tools/health.tool.ts` |
| Skill | `skills/health.md` |
| Garmin service | `services/health-worker/garmin.py` |
| Worker | `services/health-worker/app.py` |
| Architecture doc | `docs/health/README.md` |
| Detailed activities roadmap | `docs/roadmap/health-detailed-activities.md` |
| Strava integration roadmap | `docs/roadmap/health-strava-integration.md` |

## Tools Available

Health tools are only injected when `HEALTH_WORKER_SECRET` is set in environment.

| Tool | Description |
|------|-------------|
| `get_health_summary` | Aggregated metrics by period (day/week/month/year) |
| `get_health_metrics` | Detailed metric arrays for a date range |
| `get_daily_snapshot` | All metrics for a single day |
| `get_garmin_status` | Device connection and last sync status |
| `get_recent_activities` | Recent workouts/exercises |
| `get_activity_detail` | Laps, HR/power zones, and running dynamics for one activity (no GPS/route data) |
| `search_web` | Web search via Tavily |
| `read_url` | Fetch and read a URL |
| `get_today_info` | Current date/time |

The `/health` chat also receives the currently viewed day/activity as extra
context on every message (`HealthClient.tsx`'s `getPostContext`), built from
exactly what `RecentActivity.tsx`/`ActivityDetailPanel.tsx` render on
screen — so the assistant doesn't need a tool call just to know what the
user is looking at. `get_activity_detail` is for activities *other* than the
one currently open (comparisons, history).

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
| `health_activities` | Activity summaries — lossless raw Garmin payload (`raw_data`) plus normalized, explicit-unit columns (pace, power, training effect, running dynamics) |
| `health_activity_laps` | Per-lap detail (Phase 2) |
| `health_activity_zones` | Heart-rate/power time-in-zone aggregates (Phase 2) |
| `health_activity_detail_sync_jobs` | Idempotent async queue that fetches laps/zones/route/samples per activity, polled by `src/agent-worker.ts` |
| `health_activity_samples` | GPS + timestamped metric samples (Phase 3); detailed coordinates behind `?detail=true` on the route API, never in list responses |
| `health_protected_locations` | User-level privacy zones (encrypted lat/lng) that redact the start/end of served routes (Phase 3) |

## Notes

- Garmin SSO blocks connections from cloud VMs (Azure, AWS, GCP). Local/residential IPs work fine.
- The health-worker runs as a separate Python service to isolate the garth dependency from the Node.js app.
- The activity map (`ActivityRouteMap.tsx`) uses Leaflet + react-leaflet with the
  public OpenStreetMap tile server (no API key) — loaded client-only via
  `next/dynamic({ ssr: false })` since Leaflet needs `window`.
- **`src/agent-worker.ts`'s Docker image has no `node_modules` at runtime** —
  it's a single esbuild-bundled JS file, so any code it imports must never
  transitively pull in a native addon (e.g. `bcrypt`, reached via
  `src/app/lib/auth-session.ts` → `auth.service.ts`). This is why
  `runActivityDetailSync` lives in `services/health/detail-sync.service.ts`
  (a plain module, no `'use server'`, no session import) rather than in
  `actions/health.ts` — keep any future agent-worker-reachable Health code in
  that same style of file.
- Rebuilding just the `app` container after a Health backend change is not
  enough — `health-worker` (Python, Garmin mapping) and `agent-worker`
  (detail-sync poll loop) are separate images and need
  `docker-compose build health-worker agent-worker` + restart too.
