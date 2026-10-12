# Benchmark

Benchmark endpoints expose the same standard performance suite used by the Allerac Benchmark domain. Browser sessions and scoped bearer API keys are supported.

## Scopes

| Scope | Operations |
|---|---|
| `benchmark:read` | List LLM and embedding models, availability, and LLM run history |
| `benchmark:write` | Start LLM or embedding runs and clear LLM history |

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

## List embedding models

```http
GET /api/v1/benchmark/embeddings
Authorization: Bearer alr_live_...
```

The response lists the configured embedding benchmark candidates and whether each model is currently installed in Ollama:

```json
{
  "data": {
    "models": [
      { "id": "embeddinggemma", "installed": true },
      { "id": "nomic-embed-text-v2-moe", "installed": false }
    ]
  }
}
```

## Run embedding benchmark

```http
POST /api/v1/benchmark/embeddings
Authorization: Bearer alr_live_...
Content-Type: application/json

{
  "models": ["embeddinggemma", "nomic-embed-text-v2-moe"]
}
```

One to three models can be compared per request. The JSON response reports cold and warm request latency, retrieval correctness and latency, vector dimensions, and batch throughput for each model. A model-level failure is returned inside `results` without discarding successful results from the other selected models.

Embedding benchmark runs are synchronous and are not stored in the server-side LLM benchmark history. The admin UI keeps its embedding benchmark history in the current browser. The endpoint returns `429` while the benchmark concurrency limit is occupied.
