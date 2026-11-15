# Embedding Providers

Memory, notes, document search, chat search and Spotify recommendations use
vector embeddings stored in pgvector columns. Every Unit stores them in one
**embedding space**: a provider, a model, a vector size and a version string.

| Provider | Selected with | Model | Key |
| --- | --- | --- | --- |
| Ollama (default) | `EMBEDDING_PROVIDER=ollama` or unset | `EMBEDDING_MODEL` (`embeddinggemma`) | none |
| OpenAI | `EMBEDDING_PROVIDER=openai` | `OPENAI_EMBEDDING_MODEL` (`text-embedding-3-small`) | OpenAI key from Admin → API Keys, else `OPENAI_API_KEY` |

Without `EMBEDDING_PROVIDER` nothing changes: Units keep using Ollama.

## Vector size

All vector columns are `vector(768)` (migrations 103, 139 and 154).
`EMBEDDING_DIMENSIONS` (default `768`) is shared by both providers. OpenAI's
`text-embedding-3-*` models accept a `dimensions` parameter, so OpenAI is asked
for 768-dimension vectors and no migration is needed. Every response is
checked; a vector of another size is rejected, never stored.

`text-embedding-ada-002` does not support `dimensions` and cannot be used.

## No mixed vectors

Vectors from two spaces are not comparable, so they must never be searched
together. The `embedding_runtime_state` table records the space the database
is in, and the app refuses to embed (and therefore to write or search
vectors) when its configured space differs. Changing `EMBEDDING_PROVIDER`
alone only makes semantic features fail safely until the database is
switched.

| Space | Version string |
| --- | --- |
| Ollama | `EMBEDDING_VERSION` (`ollama:embeddinggemma:v1`) |
| OpenAI | `OPENAI_EMBEDDING_VERSION` (`openai:<model>:<dimensions>:v1`) |

## Switching a Unit

Run these from a checkout with `npm ci` done, with `DATABASE_URL` pointing at
the Unit's database and the same embedding variables as the app.
`reindex-local-embeddings.mjs` also needs `ENCRYPTION_KEY` to read the OpenAI
key from system settings (or `OPENAI_API_KEY`).

1. Save the OpenAI key in Admin → API Keys (for OpenAI).
2. Set `EMBEDDING_PROVIDER=openai` in the Unit's env file. On a Unit with
   `docker-compose.no-ollama.yml`, also set `MEMORY_INDEX_SWEEP_ENABLED=true`
   and `NOTE_REINDEX_SWEEP_ENABLED=true`. Recreate the app. Semantic features
   stop until step 4; chat keeps working.
3. Preview the switch (dry run, changes nothing):

   ```bash
   EMBEDDING_PROVIDER=openai npm run embeddings:switch
   ```

   It prints the current and target spaces and how many vectors would be
   cleared, and fails if `EMBEDDING_DIMENSIONS` does not match the columns.
4. Apply it:

   ```bash
   EMBEDDING_PROVIDER=openai npm run embeddings:switch -- --apply
   ```

   In one transaction it clears the vectors of `document_chunks`,
   `spotify_tracks` and `conversation_segments`, deletes
   `knowledge_semantic_index` rows from other versions (derived data), and
   records the new space. Source content is not touched.
5. Rebuild vectors:
   - document chunks and Spotify tracks:
     `EMBEDDING_PROVIDER=openai npm run embeddings:reindex`
   - notes, memories and chat segments are rebuilt by the background sweeps.

To go back to Ollama, repeat steps 2 to 5 with `EMBEDDING_PROVIDER=ollama`.
Nothing is lost except the vectors themselves, which are rebuilt.

## Health

The Setup page and `getEmbeddingHealth` report the active provider. For
OpenAI the health check only verifies that a key is configured; it makes no
paid request.
