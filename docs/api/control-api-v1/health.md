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
| `PUT /api/v1/health/activities/{activityId}/exercise-sets` | `health:write` |

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

Response:

```json
{
  "data": {
    "activities": [
      {
        "id": "activity-id",
        "name": "Morning Run",
        "type": "running",
        "startTime": "2026-06-25T07:00:00.000Z",
        "durationSeconds": 2700,
        "distanceMeters": 6200,
        "avgHeartRate": 148,
        "calories": 420
      }
    ]
  }
}
```
