# Benchmark

Benchmark endpoints expose the same standard performance suite used by the Allerac Benchmark domain. Browser sessions and scoped bearer API keys are supported.

## Scopes

| Scope | Operations |
|---|---|
| `benchmark:read` | List models, availability, and run history |
| `benchmark:write` | Start runs and clear history |

## List models

```http
GET /api/v1/benchmark/models
Authorization: Bearer alr_live_...
```

The response lists the configured model catalog and an `available` flag. Local models are available only when installed in Ollama. Cloud models require the corresponding configured provider credential.

## Run benchmark

```http
POST /api/v1/benchmark/runs
Authorization: Bearer alr_live_...
Content-Type: application/json
Accept: text/event-stream

{
  "model": "qwen2.5:3b",
  "provider": "ollama"
}
```

The response is a server-sent event stream. Events include `warmup_start`, `warmup_done`, `test_start`, `test_done`, `test_error`, `done`, and `error`. A completed run is stored under the authenticated user.

Provider values are `ollama`, `github`, `gemini`, and `anthropic`. The endpoint returns `422` when the selected cloud provider has no configured credential and `429` when the benchmark concurrency limit is occupied.

## List history

```http
GET /api/v1/benchmark/runs?limit=5
Authorization: Bearer alr_live_...
```

`limit` accepts values from 1 through 50. Only runs owned by the authenticated user are returned.

## Clear history

```http
DELETE /api/v1/benchmark/runs
Authorization: Bearer alr_live_...
```

This permanently deletes all benchmark result rows owned by the authenticated user. It does not affect other users.
