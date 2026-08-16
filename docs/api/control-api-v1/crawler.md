# Crawler API

Allerac One owns crawler source configuration, queues crawl runs, and is the
long-term source of truth for accepted content. `allerac-crawler` is a disposable
worker: it claims leased work, crawls, normalizes documents, and delivers them to
these endpoints. It never connects directly to the Allerac One database.

For the first integration, authenticate with an Allerac One API key belonging to
the source owner. Give the key only the crawler scopes it needs:

| Endpoint | Scope |
|---|---|
| `PUT /api/v1/crawler/sources` | `crawler:sources:write` |
| `POST /api/v1/crawler/runs` | `crawler:runs:write` |
| `POST /api/v1/crawler/runs/claim` | `crawler:runs:claim` |
| `POST /api/v1/crawler/runs/:id/heartbeat` | `crawler:runs:heartbeat` |
| `POST /api/v1/crawler/runs/:id/events` | `crawler:events:write` |
| `POST /api/v1/crawler/runs/:id/documents-upsert` | `crawler:documents:write` |
| `PATCH /api/v1/crawler/runs/:id` | `crawler:runs:write` |

## Flow

1. A client creates or updates a source.
2. A client queues a run.
3. The worker claims the oldest eligible run. The claim is exclusive for two
   minutes and expired leases can be reclaimed.
4. The worker renews the lease with heartbeats and publishes operational events.
5. It sends normalized documents in idempotent batches.
6. Allerac One ACKs a document only after its chunks and embeddings are durable.
7. The worker marks the run completed. Its seven-day local copy is recovery data,
   not the source of truth.

## Configure a source and queue a run

```http
PUT /api/v1/crawler/sources
Authorization: Bearer alr_live_...
Content-Type: application/json

{
  "sourceId": "receita-federal-duimp",
  "name": "Receita Federal - DUIMP",
  "startUrls": ["https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/manuais/despacho-de-importacao/sistemas/duimp"],
  "allowedDomains": ["www.gov.br"],
  "configuration": { "maxDepth": 2 },
  "domainSlug": "memory"
}
```

```http
POST /api/v1/crawler/runs
Authorization: Bearer alr_live_...
Content-Type: application/json

{ "sourceId": "receita-federal-duimp", "maxPages": 20 }
```

The enqueue response is `202 Accepted`. Source and run management responses use
the normal `{ "data": ... }` Control API envelope. Worker protocol responses are
the versioned crawler objects directly.

## Delivery and ACK

`POST /api/v1/crawler/runs/:id/documents-upsert` requires the same value in the
`Idempotency-Key` header and `idempotencyKey` body field. Repeating a completed
batch returns its stored response. A successful response distinguishes:

- `accepted`: new or changed content embedded and stored;
- `unchanged`: content hash already present and searchable;
- `rejected`: per-document failures, including whether retry is appropriate.

The portable route uses `documents-upsert`, not `documents:upsert`, because the
application routes are filesystem-backed and `:` is not valid in Windows paths.

## Ownership

Sources, runs, crawler metadata, knowledge documents, chunks, and pgvector
embeddings live in Allerac One's PostgreSQL database. The API key's user owns
everything created through the integration. The crawler needs no Supabase or
database credentials.
