# Scheduled Jobs API

Scheduled Jobs endpoints expose the cron-based prompt scheduler through the
Control API. Jobs fire prompts on a schedule and deliver results to one or more
channels (e.g. `telegram`).

## Scopes

| Endpoint | Scope |
|---|---|
| `GET /api/v1/jobs` | `jobs:read` |
| `GET /api/v1/jobs/:id/executions` | `jobs:read` |
| `POST /api/v1/jobs` | `jobs:write` |
| `PATCH /api/v1/jobs/:id` | `jobs:write` |
| `POST /api/v1/jobs/:id/toggle` | `jobs:write` |
| `DELETE /api/v1/jobs/:id` | `jobs:write` |

Browser sessions can call these endpoints without API key scopes.

## `GET /api/v1/jobs`

Lists scheduled jobs owned by the authenticated user.

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/jobs
```

Response:

```json
{
  "data": {
    "jobs": [
      {
        "id": "job-id",
        "name": "Morning digest",
        "cronExpr": "0 8 * * *",
        "prompt": "Summarize my open tickets and health metrics for today.",
        "channels": ["telegram"],
        "domainSlug": null,
        "enabled": true,
        "lastRunAt": "2026-06-25T08:00:00.000Z",
        "createdAt": "2026-06-01T00:00:00.000Z",
        "updatedAt": "2026-06-25T08:00:00.000Z"
      }
    ]
  }
}
```

## `POST /api/v1/jobs`

Creates a scheduled job.

Request body:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `name` | string | Yes | Human-readable label |
| `cronExpr` | string | Yes | Standard 5-field cron expression |
| `prompt` | string | Yes | Prompt sent to the assistant on each run |
| `channels` | string array | Yes | Delivery channels, e.g. `["telegram"]` |
| `enabled` | boolean | No | Defaults to `true` |
| `domainSlug` | string | No | Scopes the job to a domain |

Example:

```bash
curl -s \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/jobs \
  -d '{
    "name": "Morning digest",
    "cronExpr": "0 8 * * *",
    "prompt": "Summarize my open tickets and health metrics for today.",
    "channels": ["telegram"],
    "enabled": true
  }'
```

Response status:

```text
201 Created
```

Response:

```json
{
  "data": {
    "job": {
      "id": "job-id",
      "name": "Morning digest",
      "cronExpr": "0 8 * * *",
      "prompt": "Summarize my open tickets and health metrics for today.",
      "channels": ["telegram"],
      "domainSlug": null,
      "enabled": true,
      "lastRunAt": null,
      "createdAt": "2026-06-25T10:00:00.000Z",
      "updatedAt": "2026-06-25T10:00:00.000Z"
    }
  }
}
```

## `PATCH /api/v1/jobs/:id`

Updates mutable job fields. All fields are optional.

Request body:

| Field | Type | Notes |
|---|---|---|
| `name` | string | Human-readable label |
| `cronExpr` | string | Standard 5-field cron expression |
| `prompt` | string | Prompt sent on each run |
| `channels` | string array | Replaces existing channels |
| `enabled` | boolean | Enable or disable without toggling |

Example:

```bash
curl -s \
  -X PATCH \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/jobs/$JOB_ID \
  -d '{"cronExpr": "0 9 * * MON-FRI"}'
```

Response:

```json
{
  "data": {
    "job": {
      "id": "job-id",
      "name": "Morning digest",
      "cronExpr": "0 9 * * MON-FRI",
      "enabled": true
    }
  }
}
```

## `POST /api/v1/jobs/:id/toggle`

Toggles the `enabled` state of a job. No request body required.

Example:

```bash
curl -s \
  -X POST \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/jobs/$JOB_ID/toggle
```

Response:

```json
{
  "data": {
    "job": {
      "id": "job-id",
      "enabled": false
    }
  }
}
```

## `GET /api/v1/jobs/:id/executions`

Returns the execution history for a job owned by the authenticated user.

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/jobs/$JOB_ID/executions
```

Response:

```json
{
  "data": {
    "executions": [
      {
        "id": "exec-id",
        "jobId": "job-id",
        "status": "completed",
        "result": "3 open tickets. Health score: 82. No activities yesterday.",
        "startedAt": "2026-06-25T08:00:00.000Z",
        "completedAt": "2026-06-25T08:00:04.000Z"
      }
    ]
  }
}
```

## `DELETE /api/v1/jobs/:id`

Deletes a job and its execution history.

Example:

```bash
curl -s \
  -X DELETE \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/jobs/$JOB_ID
```

Response:

```json
{
  "data": {
    "deleted": true
  }
}
```
