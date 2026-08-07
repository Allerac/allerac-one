# Health API

Health endpoints expose Garmin fitness data through the Control API.
These endpoints require the health worker to be configured
(`HEALTH_WORKER_SECRET`). If the worker is not configured, all endpoints
return `503 Service Unavailable`.

## Scopes

| Endpoint | Scope |
|---|---|
| `GET /api/v1/health/status` | `health:read` |
| `GET /api/v1/health/summary` | `health:read` |
| `GET /api/v1/health/daily` | `health:read` |
| `GET /api/v1/health/activities` | `health:read` |
| `GET /api/v1/health/activities/{activityId}` | `health:read` |
| `GET /api/v1/health/activities/{activityId}/laps` | `health:read` |
| `GET /api/v1/health/activities/{activityId}/zones` | `health:read` |
| `GET /api/v1/health/activities/{activityId}/route` | `health:read` |
| `GET /api/v1/health/activities/{activityId}/series` | `health:read` |
| `POST /api/v1/health/activities/{activityId}/sync` | `health:write` |
| `DELETE /api/v1/health/activities/{activityId}` | `health:write` |
| `PUT /api/v1/health/activities/{activityId}/exercise-sets` | `health:write` |
| `GET /api/v1/health/protected-locations` | `health:read` |
| `POST /api/v1/health/protected-locations` | `health:write` |
| `DELETE /api/v1/health/protected-locations/{id}` | `health:write` |
| `GET /api/v1/health/proxy/status` | `health:proxy:read` |
| `GET /api/v1/health/proxy/activities` | `health:proxy:read` |
| `GET /api/v1/health/proxy/activities/{activityId}` | `health:proxy:read` |
| `GET /api/v1/health/proxy/activities/{activityId}/laps` | `health:proxy:read` |
| `GET /api/v1/health/proxy/activities/{activityId}/zones` | `health:proxy:read` |
| `GET /api/v1/health/proxy/activities/{activityId}/route` | `health:proxy:read` |
| `GET /api/v1/health/proxy/activities/{activityId}/series` | `health:proxy:read` |
| `GET /api/v1/health/proxy/daily` | `health:proxy:read` |

Browser sessions can call these endpoints without API key scopes.

## `GET /api/v1/health/status`

Returns the Garmin connection status for the authenticated user.

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/health/status
```

Response:

```json
{
  "data": {
    "status": {
      "isConnected": true,
      "mfaPending": false,
      "syncEnabled": true,
      "lastSyncAt": "2026-06-25T06:00:00.000Z",
      "lastError": null
    }
  }
}
```

## `GET /api/v1/health/summary`

Returns aggregated health metrics for a time period.

Query parameters:

| Name | Type | Notes |
|---|---|---|
| `period` | `day`, `3days`, `week`, `month`, `year` | Optional, defaults to `week` |

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/health/summary?period=week"
```

Response:

```json
{
  "data": {
    "summary": {
      "period": "week",
      "avgSteps": 9400,
      "avgRestingHr": 58,
      "avgSleepHours": 7.2,
      "avgStressLevel": 32,
      "totalActivities": 4,
      "totalActiveCalories": 2800
    }
  }
}
```

## `GET /api/v1/health/daily`

Returns the full health snapshot for a specific date.

Query parameters:

| Name | Type | Notes |
|---|---|---|
| `date` | string (`YYYY-MM-DD`) | Optional, defaults to today |

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/health/daily?date=2026-06-25"
```

Response:

```json
{
  "data": {
    "daily": {
      "date": "2026-06-25",
      "steps": 10234,
      "restingHeartRate": 57,
      "avgStress": 28,
      "sleepHours": 7.5,
      "sleepScore": 82,
      "activeCalories": 620,
      "bodyBatteryStart": 85,
      "bodyBatteryEnd": 42
    }
  }
}
```

## `GET /api/v1/health/activities`

Returns recent Garmin activities for the authenticated user.

Query parameters:

| Name | Type | Notes |
|---|---|---|
| `limit` | integer, 1-50 | Optional, defaults to 10 |
| `date` | string (`YYYY-MM-DD`) | Optional, filter by date |

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/health/activities?limit=5"
```

## `GET /api/v1/health/activities/{activityId}`

Returns one activity's normalized detail row, including Phase 1's provider-neutral
fields (pace, power, training effect, running dynamics, stamina where available)
and the current `detailSyncStatus` (`pending`, `syncing`, `complete`, `partial`,
or `failed`). Exact GPS coordinates and raw provider payloads are never included
in this response — see `docs/roadmap/health-detailed-activities.md`.

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/health/activities/22876543210"
```

Response:

```json
{
  "data": {
    "activity": {
      "activity_id": "22876543210",
      "sport_type": "running",
      "average_pace_seconds_per_km": 419,
      "training_effect_aerobic": 3.4,
      "detail_sync_status": "complete",
      "detail_synced_at": "2026-06-25T07:10:00.000Z"
    }
  }
}
```

## `GET /api/v1/health/activities/{activityId}/laps`

Returns laps for one activity (Phase 2). 404s if the activity doesn't exist
or doesn't belong to the caller.

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/health/activities/22876543210/laps"
```

Response:

```json
{
  "data": {
    "activityId": "22876543210",
    "laps": [
      {
        "lap_index": 1,
        "start_offset_seconds": 0,
        "duration_seconds": 300,
        "distance_meters": 1000,
        "pace_seconds_per_km": 300,
        "average_heart_rate": 150,
        "average_power_watts": 220,
        "average_cadence_spm": 164,
        "ascent_meters": 10,
        "descent_meters": 5
      }
    ]
  }
}
```

## `GET /api/v1/health/activities/{activityId}/zones`

Returns heart-rate and power time-in-zone aggregates for one activity (Phase 2).
404s if the activity doesn't exist or doesn't belong to the caller.

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/health/activities/22876543210/zones"
```

Response:

```json
{
  "data": {
    "activityId": "22876543210",
    "zones": [
      {
        "metric_type": "heart_rate",
        "zone_number": 1,
        "lower_bound": 100,
        "upper_bound": 140,
        "duration_seconds": 100,
        "percent": 25
      }
    ]
  }
}
```

## `POST /api/v1/health/activities/{activityId}/sync`

Queues (or re-queues) a Phase 2 detail sync for one activity. Processed
asynchronously by the background detail-sync poll loop; this endpoint returns
immediately once the job is queued rather than waiting on Garmin. Safe to call
repeatedly — it won't interrupt a job already `running`.

Example:

```bash
curl -s -X POST \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/health/activities/22876543210/sync"
```

Response (`202 Accepted`):

```json
{
  "data": {
    "activityId": "22876543210",
    "queued": true,
    "jobStatus": "pending"
  }
}
```

## `GET /api/v1/health/activities/{activityId}/route`

Returns route bounds and a simplified, renderer-neutral encoded polyline
(Phase 3) — cheap, always available. Pass `?detail=true` for redacted
detailed coordinates, bounded to 2000 points.

Query parameters:

| Name | Type | Notes |
|---|---|---|
| `detail` | `true` or `false` | Optional, defaults to `false` |

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/health/activities/22876543210/route?detail=true"
```

Response:

```json
{
  "data": {
    "activityId": "22876543210",
    "bounds": { "minLat": 10.0, "maxLat": 10.0004, "minLon": 20.0, "maxLon": 20.0002 },
    "simplifiedPolyline": "_p~iF~ps|U_ulLnnqC",
    "sampleCount": 5,
    "coordinates": [
      { "sample_index": 0, "timestamp": 1000, "elapsed_seconds": 0, "latitude": 10.0, "longitude": 20.0, "elevation_meters": 10.0 }
    ],
    "redacted": false
  }
}
```

## `GET /api/v1/health/activities/{activityId}/series`

Returns a bounded, downsampled time series for selected metrics (Phase 3).
Never includes latitude/longitude — use `/route` for coordinates. The same
start/end privacy-zone redaction as `/route` applies internally (elapsed
time near a protected location is trimmed even from a non-geo chart).

Query parameters:

| Name | Type | Notes |
|---|---|---|
| `metrics` | comma-separated | `heart_rate`, `pace`, `speed`, `power`, `cadence`, `elevation`, `distance`, `stamina`, `ground_contact_time`, `stride_length`, `vertical_oscillation`. Optional, defaults to all. |
| `maxPoints` | integer, 10-5000 | Optional, defaults to 500 |

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/health/activities/22876543210/series?metrics=heart_rate,power&maxPoints=200"
```

Response:

```json
{
  "data": {
    "activityId": "22876543210",
    "metrics": ["heart_rate", "power"],
    "redacted": false,
    "totalSamples": 5,
    "points": [
      { "sample_index": 0, "elapsed_seconds": 0, "heart_rate_bpm": 150, "power_watts": null }
    ]
  }
}
```

## `DELETE /api/v1/health/activities/{activityId}`

Deletes one activity and all derived data — laps, zones, and samples cascade
via foreign key. Disconnecting Garmin never does this implicitly; this is the
only path that removes activity history.

Example:

```bash
curl -s -X DELETE \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/health/activities/22876543210"
```

Response:

```json
{ "data": { "activityId": "22876543210", "deleted": true } }
```

## `GET /api/v1/health/protected-locations`

Lists the caller's privacy zones (Phase 3). Coordinates are decrypted for
display to the owner only — they are never included in activity list/route
previews, only used to compute redaction.

Response:

```json
{
  "data": {
    "locations": [
      { "id": "...", "label": "Home", "lat": 41.38, "lng": 2.17, "radiusMeters": 200 }
    ]
  }
}
```

## `POST /api/v1/health/protected-locations`

Adds a privacy zone.

```json
{ "label": "Home", "lat": 41.38, "lng": 2.17, "radiusMeters": 200 }
```

Response (`201 Created`):

```json
{ "data": { "location": { "id": "...", "label": "Home", "lat": 41.38, "lng": 2.17, "radiusMeters": 200 } } }
```

## `DELETE /api/v1/health/protected-locations/{id}`

Removes a privacy zone.

Response:

```json
{ "data": { "id": "...", "deleted": true } }
```

## `PUT /api/v1/health/activities/{activityId}/exercise-sets`

Corrects the exercise sets of a strength activity. Allerac saves the correction
locally first and then attempts to update Garmin Connect. A Garmin failure does
not roll back the local correction; the response reports
`garmin_sync_failed`, and later health synchronizations retry it up to three
times.

```json
{
  "exerciseSets": [
    {
      "setType": "ACTIVE",
      "repetitionCount": 10,
      "weight": 20000,
      "exercises": [
        {
          "category": "BENCH_PRESS",
          "name": "BARBELL_BENCH_PRESS"
        }
      ]
    }
  ]
}
```

`weight` uses Garmin's exercise-set representation (grams). Successful
responses have `garminSyncStatus: "synced"`; fallback responses have
`garminSyncStatus: "garmin_sync_failed"` while still returning
`localSaved: true`.

## Proxy endpoints (live, unstored)

`health:proxy:read` — a separate connection mode (`data_mode = 'proxy'`) for
users who want live Garmin reads without any local storage. These endpoints
call the health-worker directly on every request, never write to
`health_activities`/`health_daily_metrics`/laps/zones/samples, and never log
payload content. Every response carries `Cache-Control: no-store` and a
`meta: { connector: "garmin", dataMode: "proxy", stored: false }` marker.

Unlike the cached endpoints above, **these deliberately return the Garmin
provider's response as-is** — no column whitelist, no normalization, no
GPS/route redaction. A user on `health:proxy:read` has already opted out of
the storage layer (and its privacy-redaction guarantees) in exchange for
seeing exactly what the provider returns.

### `GET /api/v1/health/proxy/status`

Live Garmin connection status (no `health_activities`/`health_daily_metrics`
reads at all — just the connection row).

Response:

```json
{
  "data": {
    "status": { "isConnected": true, "mfaPending": false, "syncEnabled": true },
    "meta": { "connector": "garmin", "dataMode": "proxy", "stored": false }
  }
}
```

### `GET /api/v1/health/proxy/activities`

Live activity list for one date, fetched from Garmin on every call.

Query parameters:

| Name | Type | Notes |
|---|---|---|
| `date` | string (`YYYY-MM-DD`) | Required |
| `limit` | integer, 1-50 | Optional, defaults to 20 |

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/health/proxy/activities?date=2026-06-25&limit=10"
```

Response: `{ "data": { "activities": [...raw Garmin activity objects...], "meta": {...} } }`.
Returns `409 garmin_not_connected` if the user hasn't connected Garmin.

### `GET /api/v1/health/proxy/activities/{activityId}`

Live laps, zones, samples, and route for one activity — everything in a
single call, because that's how the health-worker's own `/activity-details`
fetch shapes it (one Garmin round-trip). Response is the worker's payload
untouched:

```json
{
  "data": {
    "laps": [ { "lapIndex": 1, "...": "..." } ],
    "zones": [ { "zoneNumber": 1, "...": "..." } ],
    "samples": [ { "sampleIndex": 0, "latitude": 41.38, "longitude": 2.17, "...": "..." } ],
    "route_bounds": { "minLat": 41.37, "maxLat": 41.39 },
    "route_simplified_polyline": "_p~iF~ps|U...",
    "details_raw": { "...": "the complete, unreduced Garmin activity-details payload" },
    "errors": {},
    "payload_version": 1,
    "meta": { "connector": "garmin", "dataMode": "proxy", "stored": false }
  }
}
```

`samples` includes exact GPS coordinates and `details_raw` is Garmin's full
payload — treat this response as sensitive; the storage-path privacy
redaction (`docs/roadmap/health-detailed-activities.md`) does not apply here.

Returns `400 validation_error` for a non-numeric `activityId`, `409
garmin_not_connected` if Garmin isn't connected.

### `GET /api/v1/health/proxy/activities/{activityId}/laps`, `/zones`, `/route`, `/series`

The proxy counterparts to the four cached sub-endpoints — same URL shape,
same `400`/`409` behavior as above, but each makes its **own independent
live call** to `/activity-details` (proxy mode never caches or shares
results between requests) and slices out one piece of that same raw
response:

| Endpoint | Returns |
|---|---|
| `.../laps` | `{ laps, meta }` |
| `.../zones` | `{ zones, meta }` |
| `.../route` | `{ route_bounds, route_simplified_polyline, samples, meta }` |
| `.../series` | `{ samples, meta }` |

Garmin's raw payload doesn't separate "route samples" from "series samples"
the way the cached, normalized tables do — `/route` and `/series` return the
*same* `samples` array (with GPS included, unlike the cached `/series`,
which never includes latitude/longitude). They exist as separate endpoints
only for URL-shape parity with the cached API; call `/activities/{id}`
directly if you want everything in one round-trip instead of four.

### `GET /api/v1/health/proxy/daily`

Live daily health snapshot for one date.

Query parameters:

| Name | Type | Notes |
|---|---|---|
| `date` | string (`YYYY-MM-DD`) | Required |

Response: `{ "data": { "daily": {...raw Garmin daily-health payload...}, "meta": {...} } }`.
