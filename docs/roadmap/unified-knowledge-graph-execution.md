# Unified Knowledge Graph — Execution Plan

**Status:** Phases 1–3 complete; semantic expansion planned  
**Created:** 2026-08-05  
**Parent roadmap:** [Knowledge](knowledge.md)  
**First validation record:** `DUIMP - Integration smoke test`

## Goal

Make `/memory` an honest, unified view of the user's knowledge. The graph should
initially show durable memories and documents, including documents delivered by
`allerac-crawler`, while each source remains authoritative in its existing table.

This plan is deliberately incremental. Every phase must leave the current RAG,
memory APIs, document management, and graph usable.

## Current State

The system already has the important building blocks:

- `/memory` renders `conversation_summaries` with Three.js;
- `/memory/documents` lists records from `documents`;
- document content is stored as chunks in `document_chunks`;
- each completed chunk has a local 768-dimension embedding;
- crawler provenance is stored in `crawler_documents`;
- documents and memories are owned by a user and can be scoped by `domain_slug`;
- document retrieval already uses pgvector.

The current gap is in the graph projection. `MemoryGraphPanel` calls
`memoryActions.getRecentSummaries()` and therefore never reads `documents` or
`crawler_documents`. Setting a document's domain to `memory` makes it available to
the Knowledge domain and RAG, but does not turn it into a conversation summary.

## Invariants

- Do not copy crawler documents into `conversation_summaries`.
- Do not make the browser join raw source tables.
- Do not expose another user's records or inaccessible domains.
- Do not materialize every chunk as a graph node in the first version.
- Do not claim semantic meaning for a deterministic same-domain edge.
- Every edge must include a reason and provenance.
- Source deletion must remove or invalidate its graph projection.
- The graph must still render when embeddings are unavailable.

## Target Contract

Use `KnowledgeNode` and `KnowledgeEdge` as the graph-facing language. The name is
intentionally independent from the current source tables.

```ts
type KnowledgeNodeType = 'memory' | 'document';
type KnowledgeSourceType = 'conversation' | 'manual' | 'upload' | 'crawler';

interface KnowledgeNode {
  id: string;                 // namespaced, for example "document:<uuid>"
  sourceId: string;           // authoritative source record ID
  type: KnowledgeNodeType;
  sourceType: KnowledgeSourceType;
  label: string;
  summary: string | null;
  domainSlug: string | null;
  importance: number;
  status: string | null;
  topics: string[];
  canonicalUrl: string | null;
  chunkCount: number;
  hasEmbeddings: boolean;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

type KnowledgeRelation =
  | 'same_domain'
  | 'same_source'
  | 'shared_topic'
  | 'semantically_similar';

interface KnowledgeEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relation: KnowledgeRelation;
  weight: number;
  provenance: 'deterministic' | 'embedding';
  reason: string;
}
```

## Phase 0 — Baseline and Fixtures

Purpose: preserve the working system before changing its graph contract.

Tasks:

- [ ] Add a focused test proving that the current graph loads owned memories.
- [ ] Add a query fixture for an uploaded document.
- [ ] Add a query fixture for a crawler document with canonical URL and attribution.
- [ ] Record the DUIMP smoke document ID as a local manual validation fixture.
- [ ] Confirm the existing document remains `completed` and has at least one
  non-null embedding.

Exit criteria:

- Current behavior is covered by a regression test.
- Tests can distinguish memory, upload, and crawler sources.

## Phase 1 — Unified Read Model

Purpose: make documents available to the graph without changing persistence.

Suggested files:

```text
src/app/services/knowledge/knowledge-graph.types.ts
src/app/services/knowledge/knowledge-graph.service.ts
src/app/actions/knowledge.ts
src/__tests__/services/knowledge/knowledge-graph.service.test.ts
```

Tasks:

- [ ] Create the typed node and edge contracts.
- [ ] Query owned `conversation_summaries` as memory nodes.
- [ ] Query owned `documents` as document nodes.
- [ ] Left join `crawler_documents` to identify crawler provenance.
- [ ] Aggregate chunk count and `embedding IS NOT NULL`.
- [ ] Produce short document summaries from the first chunk without exposing the
  complete document payload.
- [ ] Namespace graph IDs so source UUIDs cannot collide.
- [ ] Apply the same ownership and domain-access rules as the existing surfaces.
- [ ] Cap the initial payload, with a default of 200 nodes.
- [ ] Add tests for ownership, crawler attribution, empty chunks, failed documents,
  and domain filtering.

Initial document inclusion rule:

```text
documents.uploaded_by = current user
AND documents.status = 'completed'
```

Exit criteria:

- One service call returns memory and document nodes.
- The DUIMP smoke document is returned as `type=document`,
  `sourceType=crawler`.
- No migration is required.

## Phase 2 — Typed Graph UI

Purpose: render the unified read model on `/memory`.

Suggested files:

```text
src/app/memory/MemoryGraphPanel.tsx
src/app/memory/KnowledgeNodeDetails.tsx
src/app/memory/knowledge-graph-visuals.ts
```

Tasks:

- [ ] Replace the local `Memory` interface with `KnowledgeNode`.
- [ ] Load the graph projection instead of `getRecentSummaries()`.
- [ ] Render memories as spheres.
- [ ] Render documents with a distinct geometry or icon.
- [ ] Distinguish crawler and uploaded documents in the detail panel.
- [ ] Add type filters: all, memories, documents, crawler.
- [ ] Preserve the existing domain filter and text search.
- [ ] Show document status, chunk count, embedding availability, attribution, and
  canonical URL.
- [ ] Route document deletion through the existing document service, not the memory
  delete action.
- [ ] Preserve keyboard/mouse selection and renderer cleanup.
- [ ] Add component tests for filters, details, empty state, and delete routing.

Exit criteria:

- Refreshing `/memory` displays the DUIMP smoke document.
- The document is visually distinguishable from a memory.
- `/memory/documents` continues to work unchanged.

## Phase 3 — Deterministic Edges

Purpose: move relationship construction out of the Three.js component and make each
line explainable.

Tasks:

- [ ] Build `shared_topic` edges for memory topics.
- [ ] Build low-weight `same_domain` edges.
- [ ] Build `same_source` edges only when multiple nodes share an explicit source.
- [ ] Limit each node to its five strongest visible neighbors.
- [ ] Return `reason` and `provenance` for every edge.
- [ ] Show the relationship reason when selecting a line or neighboring node.
- [ ] Keep isolated nodes visible.
- [ ] Add deterministic ordering to prevent visual churn between refreshes.

Important:

Crawler documents do not yet have extracted topics. A same-domain edge is useful for
layout but must not be presented as semantic similarity.

Exit criteria:

- Edge construction is testable without WebGL.
- No unexplained line is rendered.
- The graph remains readable with 200 nodes.

## Phase 4 — Semantic Index for Memories

Purpose: make document-to-memory relationships possible in a compatible vector
space.

The document chunks already have versioned local embeddings. Conversation summaries
currently do not. Add a rebuildable semantic projection instead of overloading the
authoritative memory table.

Proposed migration:

```text
113_knowledge_semantic_index.sql
```

Proposed table:

```sql
knowledge_semantic_index (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  embedding vector(768) NOT NULL,
  embedding_provider TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, source_type, source_id)
)
```

Tasks:

- [ ] Confirm the shared embedding metadata contract.
- [ ] Add the semantic-index migration and HNSW index.
- [ ] Index new or changed memories asynchronously.
- [ ] Add a bounded rebuild command for existing memories.
- [ ] Remove projections when their source is deleted.
- [ ] Never compare vectors with different provider/model/version metadata.
- [ ] Report degraded status instead of blocking the graph if embedding generation
  fails.
- [ ] Add migration, reindex, deletion, and incompatible-vector tests.

Exit criteria:

- Eligible memories have embeddings in the same vector space as document chunks.
- The projection can be deleted and rebuilt from authoritative records.
- Existing memory creation does not fail when Ollama is temporarily unavailable.

## Phase 5 — Semantic Edges

Purpose: connect related knowledge across different source types.

Tasks:

- [ ] Represent each document with a bounded aggregate of its chunk embeddings or
  nearest relevant chunks.
- [ ] Query top semantic neighbors with pgvector.
- [ ] Require an experimentally selected similarity threshold.
- [ ] Limit semantic neighbors per node.
- [ ] Add `semantically_similar` edges with score, model version, and reason.
- [ ] Benchmark Portuguese, Spanish, and English examples.
- [ ] Add negative fixtures for unrelated content.
- [ ] Keep deterministic edges as fallback.

Initial safety rules:

- Semantic similarity means related content, not identical facts.
- Do not infer `contradicts`, `supersedes`, or entity identity from cosine similarity.
- Do not connect every node just to make the graph dense.

Exit criteria:

- A relevant memory can connect to a DUIMP document through measured similarity.
- Unrelated fixtures remain disconnected.
- Changing the embedding model cannot silently mix vector spaces.

## Phase 6 — Operational Hardening

Tasks:

- [ ] Measure graph query latency at 50, 200, and 1,000 source records.
- [ ] Add pagination or bounded time windows if necessary.
- [ ] Cache graph payloads only with user- and filter-specific keys.
- [ ] Invalidate caches after memory/document mutations.
- [ ] Verify source deletion removes chunks, semantic projections, and edges.
- [ ] Add audit logging for reindex failures.
- [ ] Run focused unit/API/component tests.
- [ ] Run `mkdocs build --strict`.
- [ ] Rebuild the app container and run a production-like smoke test.
- [ ] Update this checklist and the parent Knowledge roadmap.

Exit criteria:

- Ownership and domain isolation are covered by tests.
- Source mutations cannot leave authoritative stale copies.
- `/memory`, `/memory/documents`, document RAG, and crawler ingestion all pass smoke
  tests together.

## Manual Smoke Test

Use this sequence after Phases 1–3:

1. Open `http://localhost:8080/memory/documents`.
2. Confirm `DUIMP - Integration smoke test` is `completed`.
3. Open `http://localhost:8080/memory`.
4. Select the `crawler` type filter.
5. Confirm the DUIMP document appears as a document node.
6. Open its details.
7. Confirm source type, canonical URL, chunk count, and embedding availability.
8. Switch to all types and confirm existing memories still appear.
9. Delete only a disposable fixture and confirm both document list and graph refresh.

After Phase 5, add a durable memory related to customs/importation and confirm a
semantic edge appears. Add an unrelated memory and confirm it does not.

## Explicitly Deferred

- Rendering every chunk as an independent node.
- Entity extraction for people, organizations, and places.
- Contradiction and supersession classification.
- Persisting graph edges before measurements justify it.
- Replacing `/memory` or the stable `memory` domain slug.
- Copying notes, jobs, or documents into `conversation_summaries`.

## Progress Log

Append dated entries here as work lands.

### 2026-08-05

- Crawler Control API integration delivered and validated through Bruno.
- DUIMP smoke document reached `documents.status = completed`.
- Document list fixed for local embeddings and an owned document viewer added with
  crawler provenance, original-source link, chunk content, and embedding state.
- Current graph gap confirmed: `/memory` reads only `conversation_summaries`.
- Step-by-step unified graph execution plan created.

### 2026-08-06

- Added the typed `KnowledgeNode`, `KnowledgeEdge`, and `KnowledgeGraph` contracts.
- Added an owned, domain-access-aware read model for completed documents and
  conversation memories, capped at 200 nodes by default.
- Crawler provenance, canonical URL, first-chunk preview, chunk count, and embedding
  availability are projected without copying source records.
- `/memory` now renders memories as spheres and documents as octahedrons, with
  filters for memories, documents, and crawler documents.
- Added deterministic, bounded and explainable `shared_topic`, `same_source`, and
  `same_domain` edges.
- Added type-aware details and deletion routing.
- Focused service tests and production build passed; the app container was rebuilt
  and the DUIMP records were confirmed in the live database.
- Added `/memory/crawlers` for source selection, run creation, live status,
  structured event diagnostics, and document navigation.
- Validated the complete acquisition-to-chat flow with a real DUIMP crawl.
- Marked the crawler integration complete. Semantic indexing and semantic graph
  edges remain intentionally planned work rather than part of the crawler
  integration milestone.
