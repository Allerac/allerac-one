# Knowledge Search API

One semantic search over the user's knowledge: note pages, uploaded or crawled
documents, and durable memories. Tickets are not knowledge sources. They are
never indexed for retrieval and are never returned.

## Scopes

| Endpoint | Scope |
|---|---|
| `GET /api/v1/knowledge/search` | the read scope of every requested source type |

| Source type | Scope | Also requires |
|---|---|---|
| `note` | `notes:read` | access to the `notes` domain |
| `document` | `documents:read` | |
| `memory` | `memory:read` | |

When `types` is omitted, all three sources are searched, so an API key needs all
three scopes. If a key holds only some of them, pass `types` explicitly.
Browser sessions can call the endpoint without API key scopes.

## `GET /api/v1/knowledge/search`

Query parameters:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `q` | string | Yes | Natural-language query, max 1000 characters |
| `types` | string | No | Comma-separated subset of `note,document,memory`. Any other value, including `ticket`, is rejected with `400` |
| `domain` | string | No | Search only this domain. The caller must have access to it (`403` otherwise). When omitted, every source is filtered to the domains the user can access |
| `limit` | integer | No | 1-25, default 8 |
| `include_archived` | `true`/`false` | No | Include archived note pages (default `false`) |

Results contain one hit per source:

- Notes and documents are ranked by the similarity of their best chunk.
- Memories are matched semantically through the memory index, and also by keywords, so a memory that is not embedded yet can still be found.
- Scores add a small boost for memory importance and for recency.
- When the embedding backend is unavailable, `semanticAvailable` is `false` and only keyword matches for notes and memories are returned.

```json
{
  "data": {
    "semanticAvailable": true,
    "results": [
      {
        "sourceType": "memory",
        "sourceId": "6f1c…",
        "title": "Gian uses VS Code",
        "snippet": "Gian uses VS Code",
        "domainSlug": "chat",
        "score": 0.8312,
        "similarity": 0.7612,
        "match": "both",
        "createdAt": "2026-10-01T09:12:00.000Z"
      }
    ]
  }
}
```

`match` is `semantic`, `lexical` or `both`. `similarity` is `null` for keyword-only matches.

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/knowledge/search?q=which+editor+do+I+use&types=memory,note"
```

## Memory index

Memories are embedded into `knowledge_semantic_index` by a background sweep
(`memory-index-sweep.ts`):

- It runs at background priority through the shared embedding scheduler, so it respects `EMBEDDING_MAX_CONCURRENT` and always yields to interactive queries.
- It embeds one memory at a time, with a pause between memories, and caps the number per run.
- It skips memories whose content hash and embedding version are unchanged.
- Deleting a memory removes its index rows.
- The index is derived data. Deleting rows from the table rebuilds them on the next run.

| Variable | Default | Meaning |
|---|---|---|
| `MEMORY_INDEX_SWEEP_ENABLED` | `true` | Turn the sweep off |
| `MEMORY_INDEX_SWEEP_DELAY_MS` | `90000` | Delay after startup |
| `MEMORY_INDEX_SWEEP_EVERY_MS` | `300000` | Pause between runs (`0` = only once at startup) |
| `MEMORY_INDEX_SWEEP_INTERVAL_MS` | `2000` | Pause between two embeddings |
| `MEMORY_INDEX_SWEEP_MAX_PER_RUN` | `200` | Cap per run |

## Feature flags

| Variable | Default | Effect when `false` |
|---|---|---|
| `KNOWLEDGE_UNIFIED_RECALL` | `true` | `recall_memory`/`search_memory` go back to keyword-only search |
| `KNOWLEDGE_UNIFIED_RAG` | `true` | Chat auto-RAG goes back to document chunks only |

Chat auto-RAG also falls back to document chunks in these cases:

- the unified search fails;
- no embeddings are available;
- the conversation is in a public domain, which never receives memories.
